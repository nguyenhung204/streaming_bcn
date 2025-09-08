import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { ChatMessage, ChatMessageDocument } from '../schemas/chat-message.schema';
import { SessionManager } from './session-manager.service';
import { MessageBufferService } from './message-buffer.service';
import { BanUserDto, UnbanUserDto, DeleteMessageDto } from '../dto/admin.dto';

export interface UserStatus {
  userId: string;
  studentId: string;
  fullName: string;
  isActive: boolean;
  isBanned: boolean;
  bannedReason?: string;
  bannedAt?: Date;
  bannedBy?: string;
  isOnline: boolean;
  currentRoom?: string;
  lastActivity?: Date;
  lastLogin: Date;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  onlineUsers: number;
  totalMessages: number;
  activeRooms: number;
  bufferedMessages: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private server: any; // Will be set by chat gateway

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ChatMessage.name) private chatMessageModel: Model<ChatMessageDocument>,
    private sessionManager: SessionManager,
    private messageBufferService: MessageBufferService,
  ) {}

  // Method to set server instance from chat gateway
  setServer(server: any) {
    this.server = server;
  }

  /**
   * Ban user
   */
  async banUser(banUserDto: BanUserDto): Promise<void> {
    const { userId, reason, bannedBy } = banUserDto;

    // Tìm user
    const user = await this.userModel.findOne({ studentId: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.isBanned) {
      throw new BadRequestException(`User ${userId} is already banned`);
    }

    // Cập nhật trạng thái banned
    await this.userModel.updateOne(
      { studentId: userId },
      {
        isBanned: true,
        bannedReason: reason || 'Violated community guidelines',
        bannedAt: new Date(),
        bannedBy,
      }
    );

    // Disconnect user nếu đang online và emit event
    await this.sessionManager.disconnectUser(userId);

    // Emit realtime event to admin dashboard
    if (this.server) {
      this.server.emit('admin:userBanned', {
        userId,
        reason,
        bannedBy,
        bannedAt: new Date(),
        timestamp: new Date()
      });

      // Emit to specific user if they're still connected
      const userSocketIds = await this.sessionManager.getUserSocketIds(userId);
      userSocketIds.forEach(socketId => {
        this.server.to(socketId).emit('user:banned', {
          message: `Tài khoản của bạn đã bị khóa. Lý do: ${reason}`,
          reason,
          bannedBy,
          requireDisconnect: true
        });
      });
    }

    this.logger.log(`User ${userId} has been banned by ${bannedBy}. Reason: ${reason}`);
  }

  /**
   * Unban user
   */
  async unbanUser(unbanUserDto: UnbanUserDto): Promise<void> {
    const { userId } = unbanUserDto;

    const user = await this.userModel.findOne({ studentId: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.isBanned) {
      throw new BadRequestException(`User ${userId} is not banned`);
    }

    // Xóa trạng thái banned
    await this.userModel.updateOne(
      { studentId: userId },
      {
        $unset: {
          isBanned: 1,
          bannedReason: 1,
          bannedAt: 1,
          bannedBy: 1,
        }
      }
    );

    // Emit realtime event to admin dashboard
    if (this.server) {
      this.server.emit('admin:userUnbanned', {
        userId,
        unbannedAt: new Date(),
        timestamp: new Date()
      });
    }

    this.logger.log(`User ${userId} has been unbanned`);
  }

  /**
   * Get user status (online/offline and current room)
   */
  async getUserStatus(userId?: string, studentId?: string): Promise<UserStatus[]> {
    let query: any = {};
    
    if (userId) {
      query.studentId = userId;
    } else if (studentId) {
      query.studentId = studentId;
    }

    const users = await this.userModel.find(query).sort({ lastLogin: -1 });

    if (users.length === 0) {
      throw new NotFoundException('No users found');
    }

    const userStatuses: UserStatus[] = [];

    for (const user of users) {
      // Kiểm tra user có online không
      const onlineSession = await this.sessionManager.getUserSession(user.studentId);
      
      const userStatus: UserStatus = {
        userId: user.studentId,
        studentId: user.studentId,
        fullName: user.fullName,
        isActive: user.isActive,
        isBanned: user.isBanned || false,
        bannedReason: user.bannedReason,
        bannedAt: user.bannedAt,
        bannedBy: user.bannedBy,
        isOnline: !!onlineSession,
        currentRoom: onlineSession?.roomId,
        lastActivity: onlineSession?.lastActivity,
        lastLogin: user.lastLogin,
      };

      userStatuses.push(userStatus);
    }

    return userStatuses;
  }

  /**
   * Get all users with pagination
   */
  async getAllUsers(page: number = 1, limit: number = 50): Promise<{ users: UserStatus[], total: number, totalPages: number }> {
    const skip = (page - 1) * limit;
    
    const [users, total] = await Promise.all([
      this.userModel.find({}).sort({ lastLogin: -1 }).skip(skip).limit(limit),
      this.userModel.countDocuments({})
    ]);

    const userStatuses: UserStatus[] = [];

    for (const user of users) {
      const onlineSession = await this.sessionManager.getUserSession(user.studentId);
      
      userStatuses.push({
        userId: user.studentId,
        studentId: user.studentId,
        fullName: user.fullName,
        isActive: user.isActive,
        isBanned: user.isBanned || false,
        bannedReason: user.bannedReason,
        bannedAt: user.bannedAt,
        bannedBy: user.bannedBy,
        isOnline: !!onlineSession,
        currentRoom: onlineSession?.roomId,
        lastActivity: onlineSession?.lastActivity,
        lastLogin: user.lastLogin,
      });
    }

    return {
      users: userStatuses,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Delete message
   */
  async deleteMessage(deleteMessageDto: DeleteMessageDto): Promise<void> {
    const { messageId, roomId, deletedBy } = deleteMessageDto;

    // Xóa từ buffer trước
    const bufferDeleted = this.messageBufferService.deleteMessage(messageId, roomId);
    
    // Xóa từ database
    const result = await this.chatMessageModel.deleteOne({ _id: messageId, roomId });

    if (!bufferDeleted && result.deletedCount === 0) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    this.logger.log(`Message ${messageId} in room ${roomId} deleted by ${deletedBy}`);
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      totalMessages,
    ] = await Promise.all([
      this.userModel.countDocuments({}),
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ isBanned: true }),
      this.chatMessageModel.countDocuments({}),
    ]);

    const onlineUsers = await this.sessionManager.getTotalOnlineUsers();
    const activeRooms = await this.sessionManager.getActiveRoomsCount();
    const bufferStats = this.messageBufferService.getStats();

    return {
      totalUsers,
      activeUsers,
      bannedUsers,
      onlineUsers,
      totalMessages,
      activeRooms,
      bufferedMessages: bufferStats.totalRecentMessages,
    };
  }

  /**
   * Get banned users list
   */
  async getBannedUsers(): Promise<UserStatus[]> {
    const users = await this.userModel.find({ isBanned: true }).sort({ bannedAt: -1 });
    
    return users.map(user => ({
      userId: user.studentId,
      studentId: user.studentId,
      fullName: user.fullName,
      isActive: user.isActive,
      isBanned: user.isBanned,
      bannedReason: user.bannedReason,
      bannedAt: user.bannedAt,
      bannedBy: user.bannedBy,
      isOnline: false,
      lastLogin: user.lastLogin,
    }));
  }

  /**
   * Get online users
   */
  async getOnlineUsers(): Promise<UserStatus[]> {
    const onlineSessions = await this.sessionManager.getAllOnlineSessions();
    const userStatuses: UserStatus[] = [];

    for (const session of onlineSessions) {
      const user = await this.userModel.findOne({ studentId: session.userId });
      if (user) {
        userStatuses.push({
          userId: user.studentId,
          studentId: user.studentId,
          fullName: user.fullName,
          isActive: user.isActive,
          isBanned: user.isBanned || false,
          isOnline: true,
          currentRoom: session.roomId,
          lastActivity: session.lastActivity,
          lastLogin: user.lastLogin,
        });
      }
    }

    return userStatuses;
  }

  /**
   * Check if user is currently banned (realtime check)
   */
  async checkUserBannedStatus(userId: string): Promise<{ isBanned: boolean; bannedReason?: string; bannedBy?: string }> {
    this.logger.debug(`Checking banned status for user: ${userId}`);
    
    const user = await this.userModel.findOne({ studentId: userId }, { isBanned: 1, bannedReason: 1, bannedBy: 1 });
    
    if (!user) {
      this.logger.debug(`User ${userId} not found`);
      return { isBanned: false };
    }

    const result = {
      isBanned: user.isBanned || false,
      bannedReason: user.bannedReason,
      bannedBy: user.bannedBy
    };
    
    this.logger.debug(`User ${userId} banned status:`, result);
    return result;
  }
}
