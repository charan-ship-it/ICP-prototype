/**
 * Audio Player
 * Clean audio playback for TTS audio chunks
 */

import { AudioPlayerOptions } from './types';

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private queue: ArrayBuffer[] = [];
  private isPlaying = false;
  private isStopped = false;

  // Callbacks
  private onPlaybackStart?: () => void;
  private onPlaybackEnd?: () => void;
  private onError?: (error: Error) => void;

  constructor(options: AudioPlayerOptions = {}) {
    this.onPlaybackStart = options.onPlaybackStart;
    this.onPlaybackEnd = options.onPlaybackEnd;
    this.onError = options.onError;
  }

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

    console.log('[AudioPlayer] Initialized');
  }

  /**
   * Queue audio chunk for playback
   */
  queueChunk(audioData: ArrayBuffer): void {
    if (this.isStopped) {
      console.log('[AudioPlayer] Ignoring chunk - stopped');
      return;
    }

    console.log(`[AudioPlayer] Queueing chunk: ${audioData.byteLength} bytes, queue size: ${this.queue.length + 1}`);
    this.queue.push(audioData);

    // Start playing if not already
    if (!this.isPlaying) {
      console.log('[AudioPlayer] Starting playback...');
      this.playNext();
    }
  }

  /**
   * Play next chunk in queue
   */
  private async playNext(): Promise<void> {
    if (this.isStopped || this.queue.length === 0) {
      if (this.isPlaying) {
        this.isPlaying = false;
        console.log('[AudioPlayer] Playback complete');
        this.onPlaybackEnd?.();
      }
      return;
    }

    if (!this.audioContext) {
      await this.initialize();
    }

    if (!this.audioContext) {
      this.onError?.(new Error('Audio context not available'));
      return;
    }

    const chunk = this.queue.shift()!;

    try {
      // First chunk - notify playback start
      if (!this.isPlaying) {
        this.isPlaying = true;
        console.log('[AudioPlayer] Playback started');
        this.onPlaybackStart?.();
      }

      // Decode and play
      const audioBuffer = await this.audioContext.decodeAudioData(chunk.slice(0));
      
      if (this.isStopped) {
        return; // Check again after async decode
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      this.currentSource = source;

      source.onended = () => {
        this.currentSource = null;
        
        if (!this.isStopped) {
          // Play next chunk
          this.playNext();
        }
      };

      source.start(0);
    } catch (error: any) {
      console.error('[AudioPlayer] Playback error:', error);
      this.onError?.(error);
      
      // Try next chunk
      if (!this.isStopped) {
        this.playNext();
      }
    }
  }

  /**
   * Stop playback immediately (for barge-in)
   */
  stop(): void {
    console.log('[AudioPlayer] Stopping...');
    this.isStopped = true;
    
    // Clear queue first
    this.queue = [];

    // Stop current source
    if (this.currentSource) {
      try {
        this.currentSource.stop(0);
        this.currentSource.disconnect();
      } catch (e) {
        // Already stopped
      }
      this.currentSource = null;
    }

    this.isPlaying = false;
    console.log('[AudioPlayer] Stopped');
  }

  /**
   * Reset after stop (allow new playback)
   */
  reset(): void {
    this.isStopped = false;
    this.queue = [];
    console.log('[AudioPlayer] Reset');
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend();
      console.log('[AudioPlayer] Paused');
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[AudioPlayer] Resumed');
    }
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: AudioPlayerOptions): void {
    if (callbacks.onPlaybackStart) this.onPlaybackStart = callbacks.onPlaybackStart;
    if (callbacks.onPlaybackEnd) this.onPlaybackEnd = callbacks.onPlaybackEnd;
    if (callbacks.onError) this.onError = callbacks.onError;
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stop();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // Ignore
      }
    }

    this.audioContext = null;
    console.log('[AudioPlayer] Cleaned up');
  }
}

