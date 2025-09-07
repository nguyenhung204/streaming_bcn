import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from '../services/chat.service';
import { SessionManager } from '../services/session-manager.service';
import {
  ChatMessageDto,
  JoinRoomDto,
  LeaveRoomDto,
  UserTypingDto,
} from '../dto/chat.dto';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  transports: ['websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
})
@UsePipes(new ValidationPipe())
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly rateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;
  private readonly rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionManager: SessionManager,
  ) {
    // Cleanup inactive users every 5 minutes
    setInterval(async () => {
      await this.sessionManager.cleanupInactiveUsers();
    }, 5 * 60 * 1000);
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    
    // Configure Socket.IO for high performance
    server.engine.generateId = () => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    };
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`Client connected: ${client.id}`);
      
      // Check if this is a reconnection by looking for existing user session
      const existingSession = await this.sessionManager.getUserBySocketId(client.id);
      if (existingSession) {
        this.logger.log(`Reconnecting existing user: ${existingSession.username}`);
      }
      
      client.emit('connected', { 
        message: 'Connected to chat server',
        timestamp: new Date().toISOString(),
        socketId: client.id
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      this.logger.log(`Client disconnected: ${client.id}`);
      
      const userSession = await this.sessionManager.removeUserFromRoom(client.id);
      if (userSession) {
        const { roomId, userId, username } = userSession;
        
        // Remove from typing users
        await this.removeUserFromTyping(roomId, userId);
        
        // Notify room about user leaving
        client.to(roomId).emit('userLeft', {
          userId,
          username,
          timestamp: new Date().toISOString(),
          viewerCount: await this.sessionManager.getRoomUserCount(roomId),
        });

        // Update viewer count in database
        await this.chatService.updateViewerCount(
          roomId,
          await this.sessionManager.getRoomUserCount(roomId)
        );
      }
    } catch (error) {
      this.logger.error(`Disconnect error: ${error.message}`);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { roomId, userId, username } = data;

      if (!roomId || !userId || !username) {
        client.emit('error', { message: 'Invalid room data' });
        return;
      }

      // Add user to room
      await this.sessionManager.addUserToRoom(client.id, userId, username, roomId);
      
      // Join Socket.IO room
      await client.join(roomId);

      // Get recent messages
      const recentMessages = this.chatService.getRecentMessages(roomId, 100);
      
      // Get room info
      const roomInfo = await this.chatService.getRoomInfo(roomId);
      
      // Send room data to user
      client.emit('joinedRoom', {
        roomId,
        messages: recentMessages.reverse(),
        roomInfo,
        viewerCount: await this.sessionManager.getRoomUserCount(roomId),
      });

      // Notify room about new user
      client.to(roomId).emit('userJoined', {
        userId,
        username,
        timestamp: new Date().toISOString(),
        viewerCount: await this.sessionManager.getRoomUserCount(roomId),
      });

      // Update viewer count in database
      await this.chatService.updateViewerCount(
        roomId,
        await this.sessionManager.getRoomUserCount(roomId)
      );

      this.logger.log(`User ${username} joined room ${roomId}`);
    } catch (error) {
      this.logger.error(`Join room error: ${error.message}`);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: LeaveRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { roomId, userId } = data;
      
      await client.leave(roomId);
      
      const userSession = await this.sessionManager.removeUserFromRoom(client.id);
      if (userSession) {
        // Remove from typing users
        await this.removeUserFromTyping(roomId, userId);
        
        // Notify room
        client.to(roomId).emit('userLeft', {
          userId,
          username: userSession.username,
          timestamp: new Date().toISOString(),
          viewerCount: await this.sessionManager.getRoomUserCount(roomId),
        });

        // Update viewer count
        await this.chatService.updateViewerCount(
          roomId,
          await this.sessionManager.getRoomUserCount(roomId)
        );
      }
    } catch (error) {
      this.logger.error(`Leave room error: ${error.message}`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: ChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Rate limiting check
      if (!(await this.sessionManager.checkRateLimit(client.id, this.rateLimitMaxRequests, this.rateLimitWindowMs))) {
        client.emit('error', { 
          message: 'Rate limit exceeded. Please slow down.' 
        });
        return;
      }

      // Get user session with more detailed logging
      const userSession = await this.sessionManager.getUserBySocketId(client.id);
      if (!userSession) {
        this.logger.warn(`User session not found for socket ${client.id}`);
        client.emit('error', { 
          message: 'User session not found. Please refresh and rejoin the room.',
          code: 'SESSION_NOT_FOUND',
          requireReconnect: true
        });
        return;
      }

      const { userId, username, roomId } = userSession;
      this.logger.debug(`Message from user ${username} (${userId}) in room ${roomId}`);

      const { message, type = 'text' } = data;

      // Validate message
      if (!message || message.trim().length === 0) {
        return; // Ignore empty messages silently for performance
      }

      if (message.length > 500) {
        client.emit('error', { message: 'Message too long' });
        return;
      }

      // Create message in buffer (no await for maximum performance)
      const savedMessage = this.chatService.createMessage(
        roomId,
        userId,
        username,
        message.trim(),
        type
      );

      // Update user activity after message
      await this.sessionManager.updateUserActivity(userId);

      // Increment message count
      await this.sessionManager.incrementMessageCount(roomId);

      // Remove user from typing if they were typing
      await this.removeUserFromTyping(roomId, userId);

      // Broadcast message to room immediately
      const messageResponse = {
        id: savedMessage._id.toString(),
        roomId: savedMessage.roomId,
        userId: savedMessage.userId,
        username: savedMessage.username,
        message: savedMessage.message,
        timestamp: savedMessage.timestamp,
        type: savedMessage.type,
      };

      this.server.to(roomId).emit('newMessage', messageResponse);

      this.logger.log(`Message sent in room ${roomId} by ${username}`);
    } catch (error) {
      this.logger.error(`Send message error: ${error.message}`);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: UserTypingDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userSession = await this.sessionManager.getUserBySocketId(client.id);
      if (!userSession) {
        this.logger.warn(`User session not found for socket ${client.id} during typing event`);
        return;
      }

      const { roomId, userId, username, isTyping } = data;

      if (isTyping) {
        await this.addUserToTyping(roomId, userId);
      } else {
        await this.removeUserFromTyping(roomId, userId);
      }

      // Broadcast typing status to room (except sender)
      client.to(roomId).emit('userTyping', {
        userId,
        username,
        isTyping,
        timestamp: new Date().toISOString(),
      });

      // Update user activity when typing
      if (isTyping) {
        await this.sessionManager.updateUserActivity(userId);
      }
    } catch (error) {
      this.logger.error(`Typing error: ${error.message}`);
    }
  }

  @SubscribeMessage('getRoomStats')
  async handleGetRoomStats(@ConnectedSocket() client: Socket) {
    try {
      const userSession = await this.sessionManager.getUserBySocketId(client.id);
      if (!userSession) {
        client.emit('error', { message: 'User not in any room' });
        return;
      }

      const stats = await this.sessionManager.getRoomStats(userSession.roomId);
      client.emit('roomStats', stats);
    } catch (error) {
      this.logger.error(`Get room stats error: ${error.message}`);
    }
  }

  private async addUserToTyping(roomId: string, userId: string): Promise<void> {
    try {
      await this.sessionManager.addTypingUser(roomId, userId);
    } catch (error) {
      this.logger.error(`Error adding user to typing: ${error.message}`);
    }
  }

  private async removeUserFromTyping(roomId: string, userId: string): Promise<void> {
    try {
      await this.sessionManager.removeTypingUser(roomId, userId);
    } catch (error) {
      this.logger.error(`Error removing user from typing: ${error.message}`);
    }
  }
}
