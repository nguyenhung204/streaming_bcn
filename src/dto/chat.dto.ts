export interface ChatMessageDto {
  roomId: string;
  message: string;
  type?: 'text' | 'emoji' | 'system';
}

export interface JoinRoomDto {
  roomId: string;
  userId: string;
  username: string;
}

export interface LeaveRoomDto {
  roomId: string;
  userId: string;
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
  userId: string;
  username: string;
  isTyping: boolean;
}
