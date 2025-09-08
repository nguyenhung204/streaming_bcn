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
import { AdminService } from '../services/admin.service';
import { AppConfigService } from '../config/app-config.service';
import {
  ChatMessageDto,
  JoinRoomDto,
  LeaveRoomDto,
  UserTypingDto,
} from '../dto/chat.dto';
import { WsAuth } from '../decorators/ws-auth.decorator';
import { WsCurrentUser, WsUser } from '../decorators/ws-current-user.decorator';
import { WsAuthMiddleware } from '../middleware/ws-auth.middleware';

@WebSocketGateway({
  cors: {
    origin: [], // Will be set in constructor
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
    private readonly adminService: AdminService,
    private readonly appConfig: AppConfigService,
    private readonly wsAuthMiddleware: WsAuthMiddleware,
  ) {
    // Cleanup inactive users every 5 minutes
    setInterval(async () => {
      await this.sessionManager.cleanupInactiveUsers(this.appConfig.inactiveThreshold);
    }, this.appConfig.sessionCleanupInterval);
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    
    // Set server instance for admin service to emit realtime events
    this.adminService.setServer(server);
    
    // Apply authentication middleware to all socket connections
    server.use((socket, next) => {
      this.wsAuthMiddleware.use(socket, next);
    });
    
    // Configure Socket.IO for high performance
    server.engine.generateId = () => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    };
  }

  async handleConnection(client: Socket) {
    try {
      const user = client.data.user;
      
      // Check if user data exists
      if (!user) {
        this.logger.error(`No user data found for socket ${client.id}`);
        client.disconnect();
        return;
      }

      // Check if user is banned (realtime check from database)
      const bannedStatus = await this.adminService.checkUserBannedStatus(user.studentId);
      if (bannedStatus.isBanned) {
        this.logger.warn(`Banned user attempted connection: ${user.studentId}`);
        client.emit('error', { 
          message: `Tài khoản bị khóa. Lý do: ${bannedStatus.bannedReason || 'Vi phạm quy định'}`,
          code: 'USER_BANNED',
          requireReconnect: false
        });
        client.disconnect();
        return;
      }

      this.logger.log(`Client connected: ${client.id} - User: ${user.studentId} (${user.fullName})`);
      
      // Check if this is a reconnection by looking for existing user session
      const existingSession = await this.sessionManager.getUserBySocketId(client.id);
      if (existingSession) {
        this.logger.log(`Reconnecting existing user: ${existingSession.username}`);
      }
      
      client.emit('connected', { 
        message: 'Connected to chat server',
        timestamp: new Date().toISOString(),
        socketId: client.id,
        user: {
          studentId: user.studentId,
          fullName: user.fullName,
        }
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

  @WsAuth()
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: WsUser,
  ) {
    try {
      const { roomId } = data;

      if (!roomId) {
        client.emit('error', { message: 'Invalid room data' });
        return;
      }

      // Use authenticated user data instead of client-provided data
      const { userId, fullName: username } = user;

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

  @WsAuth()
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: LeaveRoomDto,
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: WsUser,
  ) {
    try {
      const { roomId } = data;
      const { userId } = user;
      
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

  @WsAuth()
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() data: ChatMessageDto,
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: WsUser,
  ) {
    try {
      // Rate limiting check
      if (!(await this.sessionManager.checkRateLimit(client.id, this.rateLimitMaxRequests, this.rateLimitWindowMs))) {
        client.emit('error', { 
          message: 'Rate limit exceeded. Please slow down.' 
        });
        return;
      }

      // Check if user is banned (realtime check from database)
      this.logger.debug(`Checking ban status before sending message for user: ${user.userId}`);
      const bannedStatus = await this.adminService.checkUserBannedStatus(user.userId);
      
      this.logger.debug(`Ban status result for ${user.userId}:`, bannedStatus);
      
      if (bannedStatus.isBanned) {
        this.logger.warn(`🚫 BANNED USER ATTEMPTED TO SEND MESSAGE: ${user.userId}`);
        this.logger.warn(`Emitting user:banned event to client ${client.id}`);
        
        client.emit('user:banned', {
          message: `Tài khoản bị khóa. Lý do: ${bannedStatus.bannedReason || 'Vi phạm quy định'}`,
          reason: bannedStatus.bannedReason,
          bannedBy: bannedStatus.bannedBy,
          code: 'USER_BANNED',
          requireDisconnect: true
        });
        
        // Force disconnect user
        await this.sessionManager.removeUserFromRoom(client.id);
        client.disconnect();
        return;
      }
      
      // Log when user is NOT banned (should be normal flow)
      this.logger.debug(`✅ User ${user.userId} is NOT banned, proceeding with message`);

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
      
      // Verify that the authenticated user matches the session user
      if (user.userId !== userId) {
        this.logger.warn(`User ID mismatch: token=${user.userId}, session=${userId}`);
        client.emit('error', { 
          message: 'Authentication mismatch. Please refresh and rejoin.',
          code: 'AUTH_MISMATCH',
          requireReconnect: true
        });
        return;
      }
      
      this.logger.debug(`Message from user ${username} (${userId}) in room ${roomId}`);

      const { message, type = 'text' } = data;

      // Validate message
      if (!message || message.trim().length === 0) {
        return; // Ignore empty messages silently for performance
      }

      if (message.length > 1000) {
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

  @WsAuth()
  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: UserTypingDto,
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: WsUser,
  ) {
    try {
      const userSession = await this.sessionManager.getUserBySocketId(client.id);
      if (!userSession) {
        this.logger.warn(`User session not found for socket ${client.id} during typing event`);
        return;
      }

      const { roomId, isTyping } = data;
      const { userId, fullName: username } = user;

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

  @WsAuth()
  @SubscribeMessage('getRoomStats')
  async handleGetRoomStats(
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: WsUser,
  ) {
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

  // Admin method to disconnect specific user
  async disconnectUserByUserId(userId: string): Promise<void> {
    try {
      // Find socket by userId and disconnect
      for (const [socketId, client] of this.server.sockets.sockets) {
        if (client.data.user?.studentId === userId) {
          this.logger.log(`Admin disconnecting user ${userId} (socket: ${socketId})`);
          client.emit('error', { 
            message: 'Tài khoản đã bị khóa bởi admin',
            code: 'BANNED_BY_ADMIN',
            requireReconnect: false
          });
          client.disconnect();
        }
      }
    } catch (error) {
      this.logger.error(`Error disconnecting user ${userId}: ${error.message}`);
    }
  }
}
