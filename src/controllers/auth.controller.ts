import { Controller, Post, Body, HttpCode, HttpStatus, Get, Param, Res, Req, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService, LoginDto, AuthResult } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResult> {
    const result = await this.authService.login(loginDto);
    
    // Set JWT token in cookie with 6 hours expiration
    const cookieOptions = {
      httpOnly: true, // Prevent XSS attacks
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict' as const, // CSRF protection
      maxAge: 6 * 60 * 60 * 1000, // 6 hours in milliseconds
      path: '/', // Available for entire site
    };

    response.cookie('access_token', result.access_token, cookieOptions);
    
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // Clear the cookie
    response.clearCookie('access_token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    
    return { message: 'Logged out successfully' };
  }

  @Get('verify')
  async verifyToken(@Req() request: Request) {
    const token = request.cookies?.access_token;
    
    if (!token) {
      return { valid: false, message: 'No token found' };
    }

    const payload = await this.authService.verifyToken(token);
    
    if (!payload) {
      return { valid: false, message: 'Invalid token' };
    }

    const user = await this.authService.validateJwtPayload(payload);
    
    if (!user) {
      return { valid: false, message: 'User not found' };
    }

    return {
      valid: true,
      user: {
        studentId: user.studentId,
        fullName: user.fullName,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount,
      }
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      studentId: user.studentId,
      fullName: user.fullName,
      tokenInfo: {
        issuedAt: new Date(user.payload.iat * 1000),
        expiresAt: new Date(user.payload.exp * 1000),
      }
    };
  }

  @Get('user/:studentId')
  async getUserInfo(@Param('studentId') studentId: string) {
    const user = await this.authService.getUserByStudentId(studentId);
    if (!user) {
      return { message: 'User not found' };
    }

    return {
      studentId: user.studentId,
      fullName: user.fullName,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      isActive: user.isActive,
    };
  }
}
