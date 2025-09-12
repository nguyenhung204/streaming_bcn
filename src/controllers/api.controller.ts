import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  HttpStatus, 
  HttpCode,
  Logger 
} from '@nestjs/common';
import { ChatService } from '../services/chat.service';
import { SessionManager } from '../services/session-manager.service';
import { ResponseUtil } from '../utils/response.util';
import { ErrorHandler } from '../utils/error-handler.util';

interface CreateRoomDto {
  roomId: string;
  title: string;
  hostId: string;
  hostName: string;
}

@Controller('api')
export class ApiController {
  private readonly logger = new Logger(ApiController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionManager: SessionManager,
  ) {}

  @Get('dashboard')
  getDashboard() {
    // Serve the dashboard HTML file
    return `
      <script>
        window.location.href = '/dashboard.html';
      </script>
    `;
  }

  @Get('admin')
  getAdmin() {
    // Short link to admin dashboard
    return `
      <script>
        window.location.href = '/dashboard.html';
      </script>
    `;
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getHealth() {
    try {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        session: {
          status: 'in-memory',
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        error: error.message,
      };
    }
  }

  @Post('rooms')
  @HttpCode(HttpStatus.CREATED)
  async createRoom(@Body() createRoomDto: CreateRoomDto) {
    return ErrorHandler.handle(async () => {
      const { roomId, title, hostId, hostName } = createRoomDto;
      
      const room = await this.chatService.createRoom(roomId, title, hostId, hostName);
      
      this.logger.log(`Room created: ${roomId} by ${hostName}`);
      
      return ResponseUtil.success(room, 'Room created successfully');
    }, {
      logger: this.logger,
      context: 'Error creating room',
      defaultValue: ResponseUtil.error('Failed to create room'),
    });
  }

  @Get('rooms/:roomId')
  async getRoomInfo(@Param('roomId') roomId: string) {
    return ErrorHandler.handle(async () => {
      const roomInfo = await this.chatService.getRoomInfo(roomId);
      if (!roomInfo) {
        return ResponseUtil.error('Room not found');
      }

      const sessionStats = await this.sessionManager.getRoomStats(roomId);
      
      const data = {
        roomId: roomInfo.roomId,
        title: roomInfo.title,
        hostId: roomInfo.hostId,
        hostName: roomInfo.hostName,
        viewerCount: roomInfo.viewerCount,
        isActive: roomInfo.isActive,
        startTime: roomInfo.startTime,
        settings: roomInfo.settings,
        currentUsers: sessionStats?.userCount || 0,
        messageCount: sessionStats?.messageCount || 0,
      };

      return ResponseUtil.success(data);
    }, {
      logger: this.logger,
      context: 'Error getting room info',
      defaultValue: ResponseUtil.error('Failed to get room info'),
    });
  }

  @Get('rooms/:roomId/messages')
  async getRoomMessages(
    @Param('roomId') roomId: string,
  ) {
    try {
      const messages = await this.chatService.getRecentMessages(roomId, 100);
      
      return {
        success: true,
        data: messages,
      };
    } catch (error) {
      this.logger.error(`Error getting room messages: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('rooms/:roomId/exists')
  async checkRoomExists(@Param('roomId') roomId: string) {
    return ErrorHandler.handle(async () => {
      const exists = await this.chatService.roomExists(roomId);
      
      return ResponseUtil.success({ 
        roomId,
        exists,
        timestamp: new Date().toISOString()
      }, exists ? 'Room exists' : 'Room not found');
    }, {
      logger: this.logger,
      context: 'Error checking room existence',
      defaultValue: ResponseUtil.error('Failed to check room existence'),
    });
  }

  @Post('rooms/:roomId/end')
  @HttpCode(HttpStatus.OK)
  async endRoom(@Param('roomId') roomId: string) {
    try {
      await this.chatService.endRoom(roomId);
      
      this.logger.log(`Room ended: ${roomId}`);
      
      return {
        success: true,
        message: 'Room ended successfully',
      };
    } catch (error) {
      this.logger.error(`Error ending room: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('stats')
  async getServerStats() {
    const rooms = await this.sessionManager.getAllRooms();
    const totalUsers = rooms.reduce((sum, room) => sum + room.userCount, 0);
    
    return {
      success: true,
      data: {
        totalRooms: rooms.length,
        totalUsers,
        rooms,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
