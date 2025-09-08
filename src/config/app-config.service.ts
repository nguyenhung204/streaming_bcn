import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Application configuration helper to centralize config access
 */
@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  // Rate limiting
  get rateLimitMaxRequests(): number {
    return this.configService.get<number>('RATE_LIMIT_MAX_REQUESTS', 30);
  }

  get rateLimitWindowMs(): number {
    return this.configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000);
  }

  // Message buffer
  get messageFlushInterval(): number {
    return this.configService.get<number>('MESSAGE_FLUSH_INTERVAL', 30000);
  }

  get messageBufferSize(): number {
    return this.configService.get<number>('MESSAGE_BUFFER_SIZE', 100);
  }

  get maxMessageLength(): number {
    return this.configService.get<number>('MAX_MESSAGE_LENGTH', 500);
  }

  // Session
  get sessionCleanupInterval(): number {
    return 5 * 60 * 1000; // 5 minutes
  }

  get inactiveThreshold(): number {
    return 5 * 60 * 1000; // 5 minutes
  }

  // JWT
  get jwtExpiryMs(): number {
    return 6 * 60 * 60 * 1000; // 6 hours
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '6h');
  }

  // Logging
  get logLevel(): string {
    return this.configService.get<string>('LOG_LEVEL', 'info');
  }

  // Socket.IO
  get socketPingTimeout(): number {
    return this.configService.get<number>('SOCKET_PING_TIMEOUT', 60000);
  }

  get socketPingInterval(): number {
    return this.configService.get<number>('SOCKET_PING_INTERVAL', 25000);
  }

  // CORS origins
  get corsOrigins(): string[] {
    return [
      'https://stream.bancongnghe.tech',
      'http://127.0.0.1:5500',
      'http://localhost:5500', 
      'http://localhost:3000',
      'http://localhost:3001',
      this.configService.get<string>('CORS_ORIGIN')
    ].filter(Boolean);
  }
}
