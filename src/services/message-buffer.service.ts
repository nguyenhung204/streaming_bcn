import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';

interface PendingMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  type: string;
  timestamp: Date;
}

@Injectable()
export class MessageBufferService {
  private readonly logger = new Logger(MessageBufferService.name);
  
  // In-memory storage for current session messages
  private messageBuffer: Map<string, PendingMessage[]> = new Map(); // roomId -> messages[]
  private recentMessages: Map<string, PendingMessage[]> = new Map(); // roomId -> recent 100 messages
  private pendingWrites: PendingMessage[] = [];
  
  // Configuration
  private readonly FLUSH_INTERVAL: number;
  private readonly BATCH_SIZE: number;
  private readonly MAX_RECENT_MESSAGES = 100; // Keep 100 recent messages per room
  private readonly EMERGENCY_FLUSH_SIZE = 1000; // Force flush if pending > 1000

  constructor(
    @InjectModel(ChatMessage.name) 
    private chatMessageModel: Model<ChatMessageDocument>,
    private configService: ConfigService,
  ) {
    // Read configuration from environment variables
    this.FLUSH_INTERVAL = this.configService.get<number>('MESSAGE_FLUSH_INTERVAL', 30000);
    this.BATCH_SIZE = this.configService.get<number>('MESSAGE_BUFFER_SIZE', 100);
    
    this.startPeriodicFlush();
  }

  /**
   * Add message to buffer and return immediately for real-time broadcast
   */
  addMessage(
    roomId: string,
    userId: string,
    username: string,
    message: string,
    type: string = 'text'
  ): PendingMessage {
    const messageData: PendingMessage = {
      id: this.generateId(),
      roomId,
      userId,
      username,
      message,
      type,
      timestamp: new Date(),
    };

    // Add to room's recent messages for real-time access
    if (!this.recentMessages.has(roomId)) {
      this.recentMessages.set(roomId, []);
    }
    
    const roomMessages = this.recentMessages.get(roomId)!;
    roomMessages.push(messageData);
    
    // Keep only recent messages
    if (roomMessages.length > this.MAX_RECENT_MESSAGES) {
      roomMessages.splice(0, roomMessages.length - this.MAX_RECENT_MESSAGES);
    }

    // Add to pending writes queue
    this.pendingWrites.push(messageData);
    
    // Emergency flush if too many pending
    if (this.pendingWrites.length >= this.EMERGENCY_FLUSH_SIZE) {
      this.logger.warn(`Emergency flush triggered - ${this.pendingWrites.length} pending messages`);
      this.flushToDatabase().catch(err => 
        this.logger.error('Emergency flush failed:', err)
      );
    }

    this.logger.debug(`Message buffered for room ${roomId}, pending: ${this.pendingWrites.length}`);
    return messageData;
  }

  /**
   * Get recent messages from memory (fast)
   */
  getRecentMessages(roomId: string, limit: number = 100): PendingMessage[] {
    const messages = this.recentMessages.get(roomId) || [];
    return messages.slice(-limit).reverse(); // Return latest first
  }

  /**
   * Get room message count from memory
   */
  getRoomMessageCount(roomId: string): number {
    return this.recentMessages.get(roomId)?.length || 0;
  }

  /**
   * Clear room messages from memory when room ends
   */
  clearRoomMessages(roomId: string): void {
    this.recentMessages.delete(roomId);
    // Remove pending writes for this room
    this.pendingWrites = this.pendingWrites.filter(msg => msg.roomId !== roomId);
    this.logger.log(`Cleared messages for room ${roomId}`);
  }

  /**
   * Force flush all pending messages to database
   */
  async forceFlush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;
    
    await this.flushToDatabase();
    this.logger.log('Force flush completed');
  }

  /**
   * Periodic flush to database
   */
  private startPeriodicFlush(): void {
    setInterval(() => {
      if (this.pendingWrites.length > 0) {
        this.flushToDatabase().catch(err => 
          this.logger.error('Periodic flush failed:', err)
        );
      }
    }, this.FLUSH_INTERVAL);
    
    this.logger.log(`Started periodic flush every ${this.FLUSH_INTERVAL}ms with batch size ${this.BATCH_SIZE}`);
  }

  /**
   * Batch write to database
   */
  private async flushToDatabase(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const startTime = Date.now();
    const messagesToWrite = this.pendingWrites.splice(0, this.BATCH_SIZE);
    
    try {
      // Batch insert to MongoDB
      const mongoMessages = messagesToWrite.map(msg => ({
        roomId: msg.roomId,
        userId: msg.userId,
        username: msg.username,
        message: msg.message,
        type: msg.type,
        timestamp: msg.timestamp,
        isDeleted: false,
      }));

      await this.chatMessageModel.insertMany(mongoMessages, { 
        ordered: false, // Don't stop on errors
        rawResult: false 
      });

      const duration = Date.now() - startTime;
      this.logger.log(
        `Flushed ${messagesToWrite.length} messages to DB in ${duration}ms, ` +
        `${this.pendingWrites.length} pending`
      );

    } catch (error) {
      this.logger.error(`Failed to flush messages to DB:`, error);
      
      // Put failed messages back to queue (at the beginning)
      this.pendingWrites.unshift(...messagesToWrite);
      
      // Limit retry queue size to prevent memory issues
      if (this.pendingWrites.length > this.EMERGENCY_FLUSH_SIZE * 2) {
        this.logger.error(`Too many failed writes, dropping oldest messages`);
        this.pendingWrites.splice(0, this.pendingWrites.length - this.EMERGENCY_FLUSH_SIZE);
      }
    }
  }

  /**
   * Generate unique message ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const totalRecentMessages = Array.from(this.recentMessages.values())
      .reduce((sum, messages) => sum + messages.length, 0);
    
    return {
      pendingWrites: this.pendingWrites.length,
      totalRecentMessages,
      activeRooms: this.recentMessages.size,
      flushInterval: this.FLUSH_INTERVAL,
      batchSize: this.BATCH_SIZE,
    };
  }

  /**
   * Cleanup on app shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Shutting down - flushing remaining messages...');
    
    // Flush all remaining messages
    while (this.pendingWrites.length > 0) {
      await this.flushToDatabase();
    }
    
    this.logger.log('All messages flushed on shutdown');
  }
}
