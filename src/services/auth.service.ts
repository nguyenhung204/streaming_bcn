import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../schemas/user.schema';

export interface LoginDto {
  studentId: string;
  birthDate: string;
}

export interface AuthResult {
  user: {
    studentId: string;
    fullName: string;
    lastLogin: Date;
    loginCount: number;
  };
  access_token: string;
}

export interface JwtPayload {
  sub: string; // studentId
  studentId: string;
  fullName: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async validateUser(studentId: string, birthDate: string): Promise<AuthResult | null> {
    try {
      const user = await this.userModel.findOne({ studentId, isActive: true });
      
      if (!user) {
        this.logger.warn(`User not found: ${studentId}`);
        return null;
      }

      const isPasswordValid = await bcrypt.compare(birthDate, user.hashedPassword);
      
      if (!isPasswordValid) {
        this.logger.warn(`Invalid password for user: ${studentId}`);
        return null;
      }

      // Update login info
      user.lastLogin = new Date();
      user.loginCount += 1;
      await user.save();

      this.logger.log(`User logged in successfully: ${studentId}`);

      // Generate JWT token
      const payload: JwtPayload = {
        sub: user.studentId,
        studentId: user.studentId,
        fullName: user.fullName,
      };

      const access_token = this.jwtService.sign(payload);

      return {
        user: {
          studentId: user.studentId,
          fullName: user.fullName,
          lastLogin: user.lastLogin,
          loginCount: user.loginCount,
        },
        access_token,
      };
    } catch (error) {
      this.logger.error(`Error validating user ${studentId}:`, error);
      return null;
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    const { studentId, birthDate } = loginDto;
    
    const result = await this.validateUser(studentId, birthDate);
    
    if (!result) {
      throw new UnauthorizedException('Mã sinh viên hoặc ngày sinh không đúng');
    }

    return result;
  }

  async getUserByStudentId(studentId: string): Promise<User | null> {
    try {
      return await this.userModel.findOne({ studentId, isActive: true });
    } catch (error) {
      this.logger.error(`Error getting user ${studentId}:`, error);
      return null;
    }
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async createUser(studentId: string, fullName: string, birthDate: string): Promise<User> {
    const hashedPassword = await this.hashPassword(birthDate);
    
    const user = new this.userModel({
      studentId,
      fullName,
      hashedPassword,
    });

    return user.save();
  }

  async validateJwtPayload(payload: JwtPayload): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({ 
        studentId: payload.studentId, 
        isActive: true 
      });
      
      if (!user) {
        this.logger.warn(`User not found for JWT payload: ${payload.studentId}`);
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error(`Error validating JWT payload:`, error);
      return null;
    }
  }

  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload;
    } catch (error) {
      this.logger.warn(`Invalid JWT token: ${error.message}`);
      return null;
    }
  }
}
