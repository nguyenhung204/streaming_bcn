import { Controller, Get } from '@nestjs/common';
import { MessageBufferService } from '../services/message-buffer.service';
import { ChatService } from '../services/chat.service';

@Controller('admin')
export class AdminController {
  constructor(
    private messageBufferService: MessageBufferService,
    private chatService: ChatService,
  ) {}

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
  @Get('flush-messages')
  async flushMessages() {
    await this.chatService.flushMessages();
    return { message: 'All pending messages flushed to database' };
  }
}
