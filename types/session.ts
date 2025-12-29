export interface Session {
  session_id: string;
  created_at: string;
  updated_at?: string;
}

export interface SessionResponse {
  session_id: string;
  created_at: string;
}

