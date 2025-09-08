import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  studentId: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  hashedPassword: string; // Hashed birthDate

  @Prop({ default: new Date() })
  lastLogin: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  loginCount: number;

  @Prop({ default: false })
  isBanned: boolean;

  @Prop()
  bannedReason?: string;

  @Prop()
  bannedAt?: Date;

  @Prop()
  bannedBy?: string;

  @Prop({ enum: ['user', 'admin'], default: 'user' })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// studentId already has unique index, no need for additional index
