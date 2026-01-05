/**
 * Audio Player for streaming audio chunks
 * Handles real-time audio playback from WebSocket TTS chunks
 */

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private isStopping: boolean = false; // Flag to prevent race conditions
  private onEndedCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;

  /**
   * Initialize audio context
   */
  async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Play audio chunk
   */
  async playChunk(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }

    if (!this.audioContext || this.isStopping) {
      return;
    }

    try {
      // Validate audio context is still valid
      if (!this.audioContext || this.audioContext.state === 'closed') {
        return; // Silently skip if context is closed
      }

      // Validate audio data
      if (!audioData || audioData.byteLength === 0) {
        return; // Silently skip empty/invalid audio
      }

      // Decode audio data with error handling
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      } catch (decodeError: any) {
        // Silently handle decoding errors (corrupted/incomplete audio chunks)
        // This can happen with network issues or incomplete WebSocket chunks
        if (decodeError.name === 'EncodingError' || decodeError.message?.includes('decode')) {
          // Silently skip corrupted chunks - don't log or propagate error
          return;
        }
        // Re-throw other errors
        throw decodeError;
      }

      // Double-check context is still valid after async decode
      if (!this.audioContext || (this.audioContext.state as string) === 'closed' || this.isStopping) {
        return;
      }

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // Store source for cleanup
      this.sourceNode = source;

      // Handle ended
      source.onended = () => {
        this.sourceNode = null;

        // Check if we're stopping - if so, don't process queue
        if (this.isStopping) {
          return;
        }

        if (this.audioQueue.length > 0) {
          // Play next chunk in queue
          const nextChunk = this.audioQueue.shift()!;
          setTimeout(() => {
            if (this.isStopping) {
              return;
            }

            this.playChunk(nextChunk).catch(() => {
              // Silently handle errors - corrupted chunks are skipped
              // Continue with next chunk if available
              if (this.audioQueue.length > 0 && !this.isStopping) {
                const chunk = this.audioQueue.shift()!;
                this.playChunk(chunk).catch(() => {
                  // Silently skip corrupted chunks
                });
              } else if (!this.isStopping) {
                this.isPlaying = false;
                this.onEndedCallback?.();
              }
            });
          }, 0);
        } else {
          // Queue empty - playback complete
          this.isPlaying = false;
          this.onEndedCallback?.();
        }
      };

      // Play
      source.start(0);
      this.isPlaying = true;
      this.isPaused = false;
    } catch (error) {
      // Silently handle errors - don't log or propagate
      // This prevents console spam from corrupted audio chunks
    }
  }

  /**
   * Queue audio chunk for playback
   */
  queueChunk(audioData: ArrayBuffer): void {
    if (this.isStopping) {
      return; // Don't queue if stopping
    }

    this.audioQueue.push(audioData);

    if (!this.isPlaying && !this.isPaused) {
      // Start playing if not already playing
      const nextChunk = this.audioQueue.shift();
      if (nextChunk) {
        this.playChunk(nextChunk).catch(() => {
          // Silently handle errors - corrupted chunks are skipped
        });
      }
    }
  }

  /**
   * Stop playback immediately
   */
  stop(): void {
    // Set flag FIRST to prevent onended from processing queue
    this.isStopping = true;

    // Clear queue BEFORE stopping node to prevent race condition
    this.audioQueue = [];

    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode = null;
    }

    this.isPlaying = false;
    this.isPaused = false;

    // Reset flag after a short delay
    setTimeout(() => {
      this.isStopping = false;
    }, 50);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.audioContext && this.audioContext.state === 'running') {
      this.audioContext.suspend();
      this.isPaused = true;
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      this.isPaused = false;
    }
  }

  /**
   * Reset player for new audio stream
   */
  reset(): void {
    this.stop();
    this.audioQueue = [];
    setTimeout(() => {
      this.isStopping = false;
    }, 10);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
  }

  /**
   * Set callback for playback ended
   */
  onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Get playing status
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get paused status
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }
}
