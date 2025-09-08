import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';

export interface WsUser {
  studentId: string;
  fullName: string;
  userId: string;
  isBanned?: boolean;
  bannedReason?: string;
  bannedAt?: Date;
  bannedBy?: string;
  payload?: any;
}

/**
 * WebSocket Current User Decorator
 * Extracts the authenticated user from WebSocket connection
 * 
 * Usage:
 * @WsAuth()
 * @SubscribeMessage('eventName')
 * handleEvent(@WsCurrentUser() user: WsUser) { ... }
 */
export const WsCurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): WsUser => {
    const client: Socket = ctx.switchToWs().getClient<Socket>();
    return client.data.user;
  },
);
