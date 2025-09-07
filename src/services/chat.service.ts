import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';
import { LiveRoom, LiveRoomDocument } from '../schemas/live-room.schema';
import { MessageBufferService } from './message-buffer.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(ChatMessage.name) 
    private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(LiveRoom.name) 
    private liveRoomModel: Model<LiveRoomDocument>,
    private messageBufferService: MessageBufferService,
  ) {}

  /**
   * Create message - buffered for high performance
   */
  createMessage(
    roomId: string,
    userId: string,
    username: string,
    message: string,
    type: string = 'text'
  ): any {
    // Add to buffer and return immediately (no await for performance)
    const bufferedMessage = this.messageBufferService.addMessage(
      roomId,
      userId,
      username,
      message,
      type
    );

    this.logger.debug(`Message buffered: ${bufferedMessage.id} in room ${roomId}`);
    
    // Return message object for immediate broadcast
    return {
      _id: bufferedMessage.id,
      roomId: bufferedMessage.roomId,
      userId: bufferedMessage.userId,
      username: bufferedMessage.username,
      message: bufferedMessage.message,
      type: bufferedMessage.type,
      timestamp: bufferedMessage.timestamp,
    };
  }

  /**
   * Get recent messages from memory buffer (super fast)
   */
  getRecentMessages(roomId: string, limit: number = 50): any[] {
    try {
      // Get from in-memory buffer for maximum performance
      const messages = this.messageBufferService.getRecentMessages(roomId, limit);
      
      this.logger.debug(`Retrieved ${messages.length} messages from buffer for room ${roomId}`);
      return messages;
    } catch (error) {
      this.logger.error(`Error fetching messages from buffer: ${error.message}`);
      return [];
    }
  }

  async createRoom(
    roomId: string,
    title: string,
    hostId: string,
    hostName: string
  ): Promise<LiveRoom> {
    try {
      const existingRoom = await this.liveRoomModel.findOne({ roomId });
      if (existingRoom) {
        existingRoom.isActive = true;
        existingRoom.startTime = new Date();
        return await existingRoom.save();
      }

      const room = new this.liveRoomModel({
        roomId,
        title,
        hostId,
        hostName,
        isActive: true,
        startTime: new Date(),
      });

      return await room.save();
    } catch (error) {
      this.logger.error(`Error creating room: ${error.message}`);
      throw error;
    }
  }

  async updateViewerCount(roomId: string, count: number): Promise<void> {
    try {
      await this.liveRoomModel.updateOne(
        { roomId },
        { viewerCount: count }
      );
    } catch (error) {
      this.logger.error(`Error updating viewer count: ${error.message}`);
    }
  }

  async getRoomInfo(roomId: string): Promise<LiveRoom> {
    try {
      return await this.liveRoomModel.findOne({ roomId, isActive: true });
    } catch (error) {
      this.logger.error(`Error getting room info: ${error.message}`);
      throw error;
    }
  }

  async endRoom(roomId: string): Promise<void> {
    try {
      // Clear messages from buffer when room ends
      this.messageBufferService.clearRoomMessages(roomId);
      
      await this.liveRoomModel.updateOne(
        { roomId },
        { 
          isActive: false,
          endTime: new Date()
        }
      );
      
      this.logger.log(`Room ${roomId} ended and messages cleared from buffer`);
    } catch (error) {
      this.logger.error(`Error ending room: ${error.message}`);
    }
  }

  /**
   * Force flush all pending messages to database
   */
  async flushMessages(): Promise<void> {
    await this.messageBufferService.forceFlush();
  }

  /**
   * Get buffer statistics for monitoring
   */
  getBufferStats() {
    return this.messageBufferService.getStats();
  }
}
