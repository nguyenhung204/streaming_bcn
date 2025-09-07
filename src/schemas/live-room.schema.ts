import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LiveRoomDocument = LiveRoom & Document;

@Schema({ 
  timestamps: true,
  collection: 'live_rooms',
  versionKey: false 
})
export class LiveRoom {
  @Prop({ required: true, unique: true })
  roomId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  hostId: string;

  @Prop({ required: true })
  hostName: string;

  @Prop({ default: 0 })
  viewerCount: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop({ 
    type: Object,
    default: {} 
  })
  settings: {
    maxChatLength?: number;
    slowMode?: number;
    moderatorMode?: boolean;
  };
}

export const LiveRoomSchema = SchemaFactory.createForClass(LiveRoom);

// Only need isActive index since roomId already has unique constraint
LiveRoomSchema.index({ isActive: 1 });
