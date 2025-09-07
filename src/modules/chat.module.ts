import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ChatGateway } from '../gateways/chat.gateway';
import { ChatService } from '../services/chat.service';
import { MessageBufferService } from '../services/message-buffer.service';
import { SessionManager } from '../services/session-manager.service';
import { ApiController } from '../controllers/api.controller';
import { AdminController } from '../controllers/admin.controller';
import { ChatMessage, ChatMessageSchema } from '../schemas/chat-message.schema';
import { LiveRoom, LiveRoomSchema } from '../schemas/live-room.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: LiveRoom.name, schema: LiveRoomSchema },
    ]),
  ],
  controllers: [ApiController, AdminController],
  providers: [
    ChatGateway,
    ChatService,
    MessageBufferService,
    SessionManager,
  ],
  exports: [
    ChatService,
    MessageBufferService,
    SessionManager,
  ],
})
export class ChatModule {}
