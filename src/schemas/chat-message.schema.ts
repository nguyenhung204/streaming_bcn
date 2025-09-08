import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({ 
  timestamps: true,
  collection: 'chat_messages',
  versionKey: false 
})
export class ChatMessage {
  @Prop({ required: true })
  roomId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true, maxlength: 500 })
  message: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop()
  deletedBy?: string;

  @Prop({ enum: ['text', 'emoji', 'system'], default: 'text' })
  type: string;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Compound index for efficient room-based queries
ChatMessageSchema.index({ roomId: 1, timestamp: -1 });
ChatMessageSchema.index({ userId: 1, timestamp: -1 });
