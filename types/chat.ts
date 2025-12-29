export interface Chat {
  id: string;
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: Date;
  unread?: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// For UI display (converts created_at string to Date)
export interface MessageDisplay {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

