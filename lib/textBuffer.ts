/**
 * Text Buffer for TTS Streaming
 * 
 * Buffers text chunks until ready to flush to TTS.
 * Optimized for low latency - sends smaller chunks faster.
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
  private isFirstFlush: boolean = true;

  constructor(options: BufferOptions = {}) {
    this.minChars = options.minChars || 20;  // Reduced from 30 for faster start
    this.maxChars = options.maxChars || 40;  // Reduced from 60 for more frequent flushes
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
    // For first flush, use lower threshold for faster speech start
    const effectiveMinChars = this.isFirstFlush ? 5 : this.minChars;  // Reduced from 15 to 5
    const effectiveMaxChars = this.isFirstFlush ? 20 : this.maxChars;  // Reduced from 40 to 20

    // Flush if we've reached max chars
    if (this.buffer.length >= effectiveMaxChars) {
      return true;
    }

    // Flush if we have min chars and hit a sentence boundary
    if (this.sentenceBoundaries && this.buffer.length >= effectiveMinChars) {
      // Check for sentence boundaries: . ! ? followed by space or end
      const sentenceEndMatch = this.buffer.match(/[.!?]\s/);
      if (sentenceEndMatch?.index !== undefined) {
        return true;
      }
      
      // Also check for comma/colon with space (natural pause points)
      const pauseMatch = this.buffer.match(/[,:;]\s/);
      if (pauseMatch?.index !== undefined && this.buffer.length >= 20) {
        return true;
      }
    }

    // For first chunk, flush even earlier if we have enough content
    // Reduced threshold from 8 to 5 chars for faster TTS start (lower latency)
    if (this.isFirstFlush && this.buffer.length >= 5) {
      const lastSpaceIndex = this.buffer.lastIndexOf(' ');
      // Flush if we have a word boundary after 3 chars (faster start)
      if (lastSpaceIndex > 3 || this.buffer.length >= 8) {
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
    this.isFirstFlush = false; // After first flush, use normal thresholds
    
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
    this.isFirstFlush = true; // Reset for next conversation
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
