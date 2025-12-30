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
            
            this.playChunk(nextChunk).catch((error) => {
              console.error('[AudioPlayer] Error playing next chunk:', error);
              this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
              // Continue with next chunk if available
              if (this.audioQueue.length > 0 && !this.isStopping) {
                const chunk = this.audioQueue.shift()!;
                this.playChunk(chunk).catch((err) => {
                  console.error('[AudioPlayer] Error in queue continuation:', err);
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
      console.error('[AudioPlayer] Error playing chunk:', error);
      this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
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
        this.playChunk(nextChunk).catch((error) => {
          console.error('[AudioPlayer] Error playing queued chunk:', error);
          this.onErrorCallback?.(error instanceof Error ? error : new Error(String(error)));
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
