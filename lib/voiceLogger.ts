/**
 * Structured logging for voice conversations
 * Provides consistent format with conversationId, chatId, and timing metrics
 */

export type VoiceStage = 
  | 'Conversation' 
  | 'VAD' 
  | 'Recording' 
  | 'STT' 
  | 'OpenAI' 
  | 'TTS' 
  | 'Audio' 
  | 'State' 
  | 'BargeIn' 
  | 'Timing' 
  | 'ChatId' 
  | 'LiveTranscription'
  | 'Error';

export interface LogMetadata {
  conversationId?: string | null;
  chatId?: string | null;
  [key: string]: any;
}

class VoiceLogger {
  private conversationId: string | null = null;
  private chatId: string | null = null;

  /**
   * Set conversation context (call when conversation starts)
   */
  setConversationContext(conversationId: string, chatId?: string | null): void {
    this.conversationId = conversationId;
    this.chatId = chatId || null;
  }

  /**
   * Update chatId (call when chatId changes)
   */
  setChatId(chatId: string | null): void {
    this.chatId = chatId;
  }

  /**
   * Clear conversation context (call when conversation ends)
   */
  clearContext(): void {
    this.conversationId = null;
    this.chatId = null;
  }

  /**
   * Log with structured format
   */
  log(stage: VoiceStage, message: string, metadata: LogMetadata = {}): void {
    const timestamp = new Date().toISOString();
    const conversationId = metadata.conversationId || this.conversationId || 'unknown';
    const chatId = metadata.chatId || this.chatId || 'unknown';

    const logMessage = `[Voice] [${stage}] ${message} [conversationId:${conversationId}] [chatId:${chatId}]`;
    
    // Add metadata if provided (but exclude legacy flag and context fields to reduce verbosity)
    const filteredMetadata = { ...metadata };
    delete filteredMetadata.conversationId;
    delete filteredMetadata.chatId;
    delete filteredMetadata.legacy;
    
    const hasMetadata = Object.keys(filteredMetadata).length > 0;
    if (hasMetadata) {
      const metaStr = JSON.stringify(filteredMetadata);
      console.log(logMessage, metaStr);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Log timing metric
   */
  timing(metric: string, durationMs: number, metadata: LogMetadata = {}): void {
    this.log('Timing', `${metric}: ${durationMs}ms`, metadata);
  }

  /**
   * Log state transition
   */
  stateTransition(from: string, to: string, reason?: string, metadata: LogMetadata = {}): void {
    const message = reason 
      ? `${from} → ${to} (reason: ${reason})`
      : `${from} → ${to}`;
    this.log('State', message, metadata);
  }

  /**
   * Log error
   */
  error(stage: VoiceStage, error: Error | string, metadata: LogMetadata = {}): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    this.log('Error', `${stage}: ${errorMessage}`, {
      ...metadata,
      error: errorMessage,
      stack: errorStack,
    });
  }

  /**
   * Get current context
   */
  getContext(): { conversationId: string | null; chatId: string | null } {
    return {
      conversationId: this.conversationId,
      chatId: this.chatId,
    };
  }
}

// Export singleton instance
export const voiceLogger = new VoiceLogger();

