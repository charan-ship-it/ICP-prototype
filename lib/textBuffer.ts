/**
 * Text Buffer for TTS Streaming
 * Buffers text chunks until threshold (50-100 chars) or sentence boundary
 */

export interface BufferOptions {
  minChars?: number;
  maxChars?: number;
  sentenceBoundaries?: boolean;
}

export class TextBuffer {
  private buffer: string = '';
  private minChars: number;
  private maxChars: number;
  private sentenceBoundaries: boolean;
  private onFlushCallback?: (text: string) => void;

  constructor(options: BufferOptions = {}) {
    this.minChars = options.minChars || 50;
    this.maxChars = options.maxChars || 100;
    this.sentenceBoundaries = options.sentenceBoundaries !== false;
  }

  /**
   * Add text chunk to buffer
   */
  add(chunk: string): void {
    this.buffer += chunk;

    // Check if we should flush
    if (this.shouldFlush()) {
      this.flush();
    }
  }

  /**
   * Check if buffer should be flushed
   */
  private shouldFlush(): boolean {
    // Flush if we've reached max chars
    if (this.buffer.length >= this.maxChars) {
      return true;
    }

    // Flush if we have min chars and hit a sentence boundary
    if (this.sentenceBoundaries && this.buffer.length >= this.minChars) {
      // Check for sentence boundaries: . ! ? followed by space or end
      const sentenceEndMatch = this.buffer.match(/[.!?]\s/);
      if (sentenceEndMatch?.index !== undefined) {
        // Found sentence boundary
        return true;
      }
    }

    // NEW: For first chunk, flush earlier to start speaking faster
    // This reduces latency when OpenAI starts streaming
    if (this.buffer.length >= 20 && this.buffer.length < this.minChars) {
      // Check for word boundaries (space) to avoid cutting words
      const lastSpaceIndex = this.buffer.lastIndexOf(' ');
      if (lastSpaceIndex > 10) {
        // We have enough text and a word boundary, flush early
        return true;
      }
    }

    return false;
  }

  /**
   * Flush buffer (send to TTS)
   */
  flush(): string {
    if (this.buffer.length === 0) {
      return '';
    }

    const text = this.buffer;
    this.buffer = '';
    
    this.onFlushCallback?.(text);
    return text;
  }

  /**
   * Force flush remaining buffer
   */
  forceFlush(): string {
    return this.flush();
  }

  /**
   * Clear buffer without flushing
   */
  clear(): void {
    this.buffer = '';
  }

  /**
   * Get current buffer content
   */
  getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get buffer length
   */
  getLength(): number {
    return this.buffer.length;
  }

  /**
   * Set callback for flush events
   */
  onFlush(callback: (text: string) => void): void {
    this.onFlushCallback = callback;
  }
}

