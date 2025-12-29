/**
 * Audio Player for streaming audio chunks
 * Handles real-time audio playback from WebSocket chunks
 */

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
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

    if (!this.audioContext) {
      throw new Error('Failed to initialize audio context');
    }

    try {
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      
      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      // Store source for cleanup
      this.sourceNode = source;
      
      // Handle ended
      source.onended = () => {
        this.sourceNode = null;
        
        // CRITICAL FIX: Check if we're stopping - if so, don't process queue
        if (this.isStopping) {
          return;
        }
        
        if (this.audioQueue.length > 0) {
          // Play next chunk in queue (use setTimeout to prevent stack overflow)
          const nextChunk = this.audioQueue.shift()!;
          setTimeout(() => {
            // Check again before playing (in case stop was called during setTimeout)
            if (this.isStopping) {
              return;
            }
            
            this.playChunk(nextChunk).catch((error) => {
              console.error('[AudioPlayer] Error playing next chunk:', error);
              this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
              // Continue with next chunk if available
              if (this.audioQueue.length > 0 && !this.isStopping) {
                const chunk = this.audioQueue.shift()!;
                this.playChunk(chunk).catch((err) => {
                  console.error('[AudioPlayer] Error in queue continuation:', err);
                });
              } else {
                // BUG FIX: Set isPlaying to false BEFORE calling onEnded
                // This ensures state is correct when callback checks it
                this.isPlaying = false;
                this.onEndedCallback?.();
              }
            });
          }, 0);
        } else {
          // BUG FIX: Set isPlaying to false BEFORE calling onEnded
          // This ensures state is correct when callback checks it
          this.isPlaying = false;
          this.onEndedCallback?.();
        }
      };

      // Play
      source.start(0);
      this.isPlaying = true;
      this.isPaused = false;
    } catch (error) {
      console.error('[AudioPlayer] Error playing chunk:', error);
      this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Queue audio chunk for playback
   */
  queueChunk(audioData: ArrayBuffer): void {
    this.audioQueue.push(audioData);
    
    // Log queue length periodically (every 5 chunks)
    if (this.audioQueue.length % 5 === 0) {
      console.log(`[AudioPlayer] Queue length: ${this.audioQueue.length}`);
    }
    
    if (!this.isPlaying && !this.isPaused) {
      // Start playing if not already playing
      const nextChunk = this.audioQueue.shift();
      if (nextChunk) {
        this.playChunk(nextChunk).catch((error) => {
          console.error('[AudioPlayer] Error playing queued chunk:', error);
          this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
        });
      }
    }
  }

  /**
   * Stop playback - CRITICAL FIX: Prevent race condition
   */
  stop(): void {
    // CRITICAL FIX: Set flag FIRST to prevent onended from processing queue
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
    
    // Reset flag after a short delay to allow onended to complete
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
   * Cleanup
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

