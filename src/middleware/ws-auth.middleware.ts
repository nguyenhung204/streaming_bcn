import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AuthService } from '../services/auth.service';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsAuthMiddleware {
  private readonly logger = new Logger(WsAuthMiddleware.name);

  constructor(private authService: AuthService) {}

  async use(socket: Socket, next: (err?: any) => void) {
    try {
      const token = this.extractTokenFromSocket(socket);

      if (!token) {
        this.logger.warn(`No authentication token found for socket: ${socket.id}`);
        return next(new WsException('No authentication token found'));
      }

      // Verify JWT token
      const payload = await this.authService.verifyToken(token);
      if (!payload) {
        this.logger.warn(`Invalid token for socket: ${socket.id}`);
        return next(new WsException('Invalid authentication token'));
      }

      // Validate user exists and is active
      const user = await this.authService.validateJwtPayload(payload);
      if (!user) {
        this.logger.warn(`User not found for token payload: ${payload.studentId}`);
        return next(new WsException('User not found or inactive'));
      }

      // Store user data in socket for later use
      socket.data.user = {
        studentId: user.studentId,
        fullName: user.fullName,
        userId: user.studentId, // Using studentId as userId for consistency
        payload,
      };

      this.logger.debug(`Socket ${socket.id} authenticated as ${user.studentId}`);
      next();
    } catch (error) {
      this.logger.error(`WebSocket authentication middleware failed: ${error.message}`);
      next(new WsException('Authentication failed'));
    }
  }

  /**
   * Extract JWT token from WebSocket connection
   * Supports multiple token sources:
   * 1. Query parameter: ?token=jwt_token
   * 2. Authorization header: Bearer jwt_token
   * 3. Cookie: access_token=jwt_token
   */
  private extractTokenFromSocket(socket: Socket): string | null {
    // Debug: Log all handshake info
    this.logger.debug(`Socket handshake query: ${JSON.stringify(socket.handshake.query)}`);
    this.logger.debug(`Socket handshake headers: ${JSON.stringify(socket.handshake.headers)}`);
    
    // Try to get token from query parameters
    const queryToken = socket.handshake.query.token;
    if (queryToken && typeof queryToken === 'string') {
      this.logger.debug(`Found token in query parameter`);
      return queryToken;
    }

    // Try to get token from Authorization header
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        this.logger.debug(`Found token in Authorization header`);
        return token;
      }
    }

    // Try to get token from cookies
    const cookies = socket.handshake.headers.cookie;
    this.logger.debug(`Raw cookies: ${cookies}`);
    if (cookies) {
      const cookieArray = cookies.split(';');
      for (const cookie of cookieArray) {
        const [name, value] = cookie.trim().split('=');
        this.logger.debug(`Checking cookie: ${name} = ${value}`);
        if (name === 'access_token' && value) {
          this.logger.debug(`Found token in cookie`);
          return value;
        }
      }
    }

    this.logger.warn(`No token found in any source`);
    return null;
  }
}
