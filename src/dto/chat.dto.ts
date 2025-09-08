export interface ChatMessageDto {
  roomId: string;
  message: string;
  type?: 'text' | 'emoji' | 'system';
}

export interface JoinRoomDto {
  roomId: string;
  // userId and username will be extracted from authenticated user
}

export interface LeaveRoomDto {
  roomId: string;
  // userId will be extracted from authenticated user
}

export interface ChatMessageResponse {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
  type: string;
}

export interface RoomStatsDto {
  roomId: string;
  viewerCount: number;
  messageCount: number;
}

export interface UserTypingDto {
  roomId: string;
  isTyping: boolean;
  // userId and username will be extracted from authenticated user
}
