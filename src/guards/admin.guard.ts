import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Get token from header or cookie
    const token = this.extractTokenFromRequest(request);
    
    if (!token) {
      throw new ForbiddenException('Access token required');
    }

    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token);
      
      // Get user from database
      const user = await this.userModel.findOne({ 
        studentId: payload.studentId,
        isActive: true 
      });

      if (!user) {
        throw new ForbiddenException('User not found');
      }

      if (user.isBanned) {
        throw new ForbiddenException('User is banned');
      }

      // Check if user has admin role
      if (user.role !== 'admin') {
        throw new ForbiddenException('Admin role required');
      }

      // Add user to request for later use
      request.user = {
        studentId: user.studentId,
        fullName: user.fullName,
        role: user.role,
      };

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException('Invalid token');
    }
  }

  private extractTokenFromRequest(request: any): string | null {
    // Try Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try cookie
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token;
    }

    return null;
  }
}
