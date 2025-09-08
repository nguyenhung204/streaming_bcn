import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class BanUserDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  bannedBy?: string;
}

export class UnbanUserDto {
  @IsNotEmpty()
  @IsString()
  userId: string;
}

export class DeleteMessageDto {
  @IsNotEmpty()
  @IsString()
  messageId: string;

  @IsNotEmpty()
  @IsString()
  roomId: string;

  @IsNotEmpty()
  @IsString()
  deletedBy: string;
}

export class GetUserStatusDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}
