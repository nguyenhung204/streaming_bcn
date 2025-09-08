import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Socket } from 'socket.io';
import { AuthService } from '../services/auth.service';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtAuthGuard.name);

  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      const token = this.extractTokenFromSocket(client);

      if (!token) {
        this.logger.warn(`No authentication token found for socket: ${client.id}`);
        throw new WsException('No authentication token found');
      }

      // Verify JWT token
      const payload = await this.authService.verifyToken(token);
      if (!payload) {
        this.logger.warn(`Invalid token for socket: ${client.id}`);
        throw new WsException('Invalid authentication token');
      }

      // Validate user exists and is active
      const user = await this.authService.validateJwtPayload(payload);
      if (!user) {
        this.logger.warn(`User not found for token payload: ${payload.studentId}`);
        throw new WsException('User not found or inactive');
      }

      // Attach user data to socket for later use
      client.data.user = {
        studentId: user.studentId,
        fullName: user.fullName,
        userId: user.studentId, // Using studentId as userId for consistency
        payload,
      };

      this.logger.debug(`Socket ${client.id} authenticated as ${user.studentId}`);
      return true;
    } catch (error) {
      this.logger.error(`WebSocket authentication failed: ${error.message}`);
      
      if (error instanceof WsException) {
        throw error;
      }
      
      throw new WsException('Authentication failed');
    }
  }

  /**
   * Extract JWT token from WebSocket connection
   * Supports multiple token sources:
   * 1. Query parameter: ?token=jwt_token
   * 2. Authorization header: Bearer jwt_token
   * 3. Cookie: access_token=jwt_token
   */
  private extractTokenFromSocket(client: Socket): string | null {
    // Try to get token from query parameters
    const queryToken = client.handshake.query.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    // Try to get token from Authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    // Try to get token from cookies
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const cookieArray = cookies.split(';');
      for (const cookie of cookieArray) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'access_token' && value) {
          return value;
        }
      }
    }

    return null;
  }
}
