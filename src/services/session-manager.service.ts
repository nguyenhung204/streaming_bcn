import { Injectable, Logger } from '@nestjs/common';
import { ErrorHandler } from '../utils/error-handler.util';

interface UserSession {
  userId: string;
  username: string;
  socketId: string;
  roomId: string;
  joinTime: Date;
  lastActivity: Date;
}

interface RoomInfo {
  roomId: string;
  userCount: number;
  messageCount: number;
  createdAt: Date;
}

@Injectable()
export class SessionManager {
  private readonly logger = new Logger(SessionManager.name);
  
  private userSessions: Map<string, UserSession> = new Map(); // socketId -> UserSession
  private userRooms: Map<string, string> = new Map(); // userId -> roomId
  private roomUsers: Map<string, Set<string>> = new Map(); // roomId -> Set<userId>
  private roomMessageCounts: Map<string, number> = new Map(); // roomId -> count
  private typingUsers: Map<string, Set<string>> = new Map(); // roomId -> Set<userId>

  async addUserToRoom(
    socketId: string,
    userId: string,
    username: string,
    roomId: string
  ): Promise<void> {
    return ErrorHandler.handle(
      async () => {
        // Remove user from previous room if exists
        await this.removeUserFromAllRooms(userId);

        const userSession: UserSession = {
          userId,
          username,
          socketId,
          roomId,
          joinTime: new Date(),
          lastActivity: new Date(),
        };

        // Store session
        this.userSessions.set(socketId, userSession);
        this.userRooms.set(userId, roomId);
        
        // Add to room
        if (!this.roomUsers.has(roomId)) {
          this.roomUsers.set(roomId, new Set());
        }
        this.roomUsers.get(roomId)!.add(userId);

        this.logger.log(`User ${username} joined room ${roomId} with socket ${socketId}`);
      },
      {
        logger: this.logger,
        context: 'Error adding user to room',
      }
    );
  }

  async removeUserFromRoom(socketId: string): Promise<UserSession | null> {
    return ErrorHandler.handle(
      async () => {
        const userSession = this.userSessions.get(socketId);
        if (!userSession) return null;

        const { userId, roomId, username } = userSession;

        // Remove from all storages
        this.userSessions.delete(socketId);
        this.userRooms.delete(userId);
        this.roomUsers.get(roomId)?.delete(userId);
        
        // Remove from typing if was typing
        this.typingUsers.get(roomId)?.delete(userId);

        this.logger.log(`User ${username} left room ${roomId}`);
        return userSession;
      },
      {
        logger: this.logger,
        context: 'Error removing user from room',
        defaultValue: null,
      }
    );
  }

  async removeUserFromAllRooms(userId: string): Promise<void> {
    try {
      const roomId = this.userRooms.get(userId);
      if (roomId) {
        this.roomUsers.get(roomId)?.delete(userId);
        this.typingUsers.get(roomId)?.delete(userId);
      }
      this.userRooms.delete(userId);
      
      // Find and remove socket session
      for (const [socketId, session] of this.userSessions.entries()) {
        if (session.userId === userId) {
          this.userSessions.delete(socketId);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Error removing user from all rooms: ${error.message}`);
    }
  }

  async getRoomUsers(roomId: string): Promise<UserSession[]> {
    try {
      const userIds = this.roomUsers.get(roomId) || new Set();
      const users: UserSession[] = [];
      
      for (const session of this.userSessions.values()) {
        if (userIds.has(session.userId) && session.roomId === roomId) {
          users.push(session);
        }
      }
      
      return users;
    } catch (error) {
      this.logger.error(`Error getting room users: ${error.message}`);
      return [];
    }
  }

  async getRoomUserCount(roomId: string): Promise<number> {
    try {
      return this.roomUsers.get(roomId)?.size || 0;
    } catch (error) {
      this.logger.error(`Error getting room user count: ${error.message}`);
      return 0;
    }
  }

  async getUserBySocketId(socketId: string): Promise<UserSession | null> {
    try {
      return this.userSessions.get(socketId) || null;
    } catch (error) {
      this.logger.error(`Error getting user by socket ID: ${error.message}`);
      return null;
    }
  }

  async getUserByUserId(userId: string): Promise<UserSession | null> {
    try {
      for (const session of this.userSessions.values()) {
        if (session.userId === userId) {
          return session;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Error getting user by user ID: ${error.message}`);
      return null;
    }
  }

  async updateUserActivity(userId: string): Promise<void> {
    try {
      for (const session of this.userSessions.values()) {
        if (session.userId === userId) {
          session.lastActivity = new Date();
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Error updating user activity for ${userId}: ${error.message}`);
    }
  }

  async incrementMessageCount(roomId: string): Promise<void> {
    try {
      const current = this.roomMessageCounts.get(roomId) || 0;
      this.roomMessageCounts.set(roomId, current + 1);
    } catch (error) {
      this.logger.error(`Error incrementing message count: ${error.message}`);
    }
  }

  async getRoomStats(roomId: string): Promise<RoomInfo | null> {
    try {
      const userCount = this.getRoomUserCount(roomId);
      const messageCount = this.roomMessageCounts.get(roomId) || 0;
      const users = await this.getRoomUsers(roomId);
      
      return {
        roomId,
        userCount: await userCount,
        messageCount,
        createdAt: new Date(),
        users: users.map(user => ({
          userId: user.userId,
          username: user.username,
          joinTime: user.joinTime,
          lastActivity: user.lastActivity,
        }))
      } as any;
    } catch (error) {
      this.logger.error(`Error getting room stats: ${error.message}`);
      return null;
    }
  }

  async getAllRooms(): Promise<any[]> {
    try {
      const rooms = [];
      for (const roomId of this.roomUsers.keys()) {
        const stats = await this.getRoomStats(roomId);
        if (stats) {
          rooms.push(stats);
        }
      }
      return rooms;
    } catch (error) {
      this.logger.error(`Error getting all rooms: ${error.message}`);
      return [];
    }
  }

  // Cleanup inactive users (called periodically)
  async cleanupInactiveUsers(inactiveThresholdMs: number = 300000): Promise<void> { // 5 minutes
    return ErrorHandler.handle(
      async () => {
        const now = new Date();
        const sessionsToRemove: string[] = [];
        
        for (const [socketId, session] of this.userSessions.entries()) {
          if (now.getTime() - session.lastActivity.getTime() > inactiveThresholdMs) {
            sessionsToRemove.push(socketId);
          }
        }
        
        for (const socketId of sessionsToRemove) {
          await this.removeUserFromRoom(socketId);
        }
        
        this.logger.log(`Cleaned up ${sessionsToRemove.length} inactive sessions`);
      },
      {
        logger: this.logger,
        context: 'Error cleaning up inactive users',
      }
    );
  }

  // Rate limiting methods
  private rateLimitMap: Map<string, number[]> = new Map();
  
  async checkRateLimit(socketId: string, maxRequests: number = 30, windowMs: number = 60000): Promise<boolean> {
    return ErrorHandler.handle(
      async () => {
        const now = Date.now();
        const requests = this.rateLimitMap.get(socketId) || [];
        
        // Remove old requests
        const recentRequests = requests.filter(time => now - time < windowMs);
        
        if (recentRequests.length >= maxRequests) {
          return false;
        }
        
        recentRequests.push(now);
        this.rateLimitMap.set(socketId, recentRequests);
        
        return true;
      },
      {
        logger: this.logger,
        context: 'Error checking rate limit',
        defaultValue: true, // Allow on error
      }
    );
  }

  // Typing users management
  async addTypingUser(roomId: string, userId: string): Promise<void> {
    try {
      if (!this.typingUsers.has(roomId)) {
        this.typingUsers.set(roomId, new Set());
      }
      this.typingUsers.get(roomId)!.add(userId);
    } catch (error) {
      this.logger.error(`Error adding typing user: ${error.message}`);
    }
  }

  async removeTypingUser(roomId: string, userId: string): Promise<void> {
    try {
      this.typingUsers.get(roomId)?.delete(userId);
    } catch (error) {
      this.logger.error(`Error removing typing user: ${error.message}`);
    }
  }

  async getTypingUsers(roomId: string): Promise<string[]> {
    try {
      return Array.from(this.typingUsers.get(roomId) || new Set());
    } catch (error) {
      this.logger.error(`Error getting typing users: ${error.message}`);
      return [];
    }
  }

  // Admin methods
  async disconnectUser(userId: string): Promise<void> {
    return ErrorHandler.handle(
      async () => {
        // Find socket by userId
        for (const [socketId, session] of this.userSessions.entries()) {
          if (session.userId === userId) {
            await this.removeUserFromRoom(socketId);
            this.logger.log(`Force disconnected user ${userId}`);
            break;
          }
        }
      },
      {
        logger: this.logger,
        context: 'Error disconnecting user',
      }
    );
  }

  async getUserSession(userId: string): Promise<UserSession | null> {
    try {
      for (const session of this.userSessions.values()) {
        if (session.userId === userId) {
          return session;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Error getting user session: ${error.message}`);
      return null;
    }
  }

  async getUserSocketIds(userId: string): Promise<string[]> {
    try {
      const socketIds: string[] = [];
      for (const [socketId, session] of this.userSessions.entries()) {
        if (session.userId === userId) {
          socketIds.push(socketId);
        }
      }
      return socketIds;
    } catch (error) {
      this.logger.error(`Error getting user socket IDs: ${error.message}`);
      return [];
    }
  }

  async getTotalOnlineUsers(): Promise<number> {
    try {
      return this.userSessions.size;
    } catch (error) {
      this.logger.error(`Error getting online users count: ${error.message}`);
      return 0;
    }
  }

  async getActiveRoomsCount(): Promise<number> {
    try {
      return this.roomUsers.size;
    } catch (error) {
      this.logger.error(`Error getting active rooms count: ${error.message}`);
      return 0;
    }
  }

  async getAllOnlineSessions(): Promise<UserSession[]> {
    try {
      return Array.from(this.userSessions.values());
    } catch (error) {
      this.logger.error(`Error getting all online sessions: ${error.message}`);
      return [];
    }
  }
}
