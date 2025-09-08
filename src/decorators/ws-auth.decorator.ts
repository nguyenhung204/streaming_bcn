import { applyDecorators, UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from 'src/guards/ws-jwt-auth.guard';

/**
 * WebSocket Authentication Decorator
 * Ensures that all WebSocket events require valid JWT authentication
 * 
 * Usage:
 * @WsAuth()
 * @SubscribeMessage('eventName')
 * handleEvent() { ... }
 */
export function WsAuth() {
  return applyDecorators(
    UseGuards(WsJwtAuthGuard)
  );
}
