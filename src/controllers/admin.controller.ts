import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Body, 
  Param, 
  Query, 
  ValidationPipe,
  ParseIntPipe,
  UseGuards,
  Request
} from '@nestjs/common';
import { MessageBufferService } from '../services/message-buffer.service';
import { ChatService } from '../services/chat.service';
import { AdminService } from '../services/admin.service';
import { 
  BanUserDto, 
  UnbanUserDto, 
  DeleteMessageDto, 
  GetUserStatusDto 
} from '../dto/admin.dto';
import { AdminGuard } from '../guards/admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private messageBufferService: MessageBufferService,
    private chatService: ChatService,
    private adminService: AdminService,
  ) {}

  /**
   * Get dashboard statistics
   */
  @Get('dashboard/stats')
  async getDashboardStats() {
    return await this.adminService.getDashboardStats();
  }

  /**
   * Get all users with pagination
   */
  @Get('users')
  async getAllUsers(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
  ) {
    return await this.adminService.getAllUsers(page, limit);
  }

  /**
   * Get user status by userId or studentId
   */
  @Get('users/status')
  async getUserStatus(@Query() query: GetUserStatusDto) {
    return await this.adminService.getUserStatus(query.userId, query.studentId);
  }

  /**
   * Get online users
   */
  @Get('users/online')
  async getOnlineUsers() {
    return await this.adminService.getOnlineUsers();
  }

  /**
   * Get banned users
   */
  @Get('users/banned')
  async getBannedUsers() {
    return await this.adminService.getBannedUsers();
  }

  /**
   * Ban user
   */
  @Post('users/ban')
  async banUser(@Body(ValidationPipe) banUserDto: BanUserDto, @Request() req) {
    // Auto-set bannedBy from authenticated admin
    banUserDto.bannedBy = req.user.studentId;
    
    await this.adminService.banUser(banUserDto);
    return { 
      success: true, 
      message: `User ${banUserDto.userId} has been banned successfully by ${req.user.fullName}` 
    };
  }

  /**
   * Unban user
   */
  @Post('users/unban')
  async unbanUser(@Body(ValidationPipe) unbanUserDto: UnbanUserDto) {
    await this.adminService.unbanUser(unbanUserDto);
    return { 
      success: true, 
      message: `User ${unbanUserDto.userId} has been unbanned successfully` 
    };
  }

  /**
   * Delete message
   */
  @Delete('messages')
  async deleteMessage(@Body(ValidationPipe) deleteMessageDto: DeleteMessageDto) {
    await this.adminService.deleteMessage(deleteMessageDto);
    return { 
      success: true, 
      message: `Message ${deleteMessageDto.messageId} has been deleted successfully` 
    };
  }

  /**
   * Get buffer statistics for monitoring
   */
  @Get('buffer-stats')
  getBufferStats() {
    return this.chatService.getBufferStats();
  }

  /**
   * Force flush all pending messages to database
   */
  @Post('flush-messages')
  async flushMessages() {
    await this.chatService.flushMessages();
    return { message: 'All pending messages flushed to database' };
  }
}
