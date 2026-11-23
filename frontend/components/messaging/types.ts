export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
}

export interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  read: boolean;
  attachments?: MessageAttachment[];
  pending?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: string;
  avatarUrl?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface TypingState {
  conversationId: string;
  userId: string;
}
