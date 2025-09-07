import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.access_token;

    if (!token) {
      throw new UnauthorizedException('No authentication token found');
    }

    try {
      const payload = await this.authService.verifyToken(token);
      if (!payload) {
        throw new UnauthorizedException('Invalid token');
      }

      const user = await this.authService.validateJwtPayload(payload);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Attach user to request object
      request['user'] = {
        studentId: user.studentId,
        fullName: user.fullName,
        payload,
      };

      return true;
    } catch (error) {
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
