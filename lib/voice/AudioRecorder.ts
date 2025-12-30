/**
 * Audio Recorder
 * Clean MediaRecorder wrapper for capturing user speech
 */

import { AudioRecorderOptions } from './types';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private options: AudioRecorderOptions;
  private isRecording = false;

  constructor(options: AudioRecorderOptions = {}) {
    this.options = {
      mimeType: this.getSupportedMimeType(),
      timeslice: 100,
      ...options,
    };
  }

  /**
   * Get the best supported audio MIME type
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // Fallback
  }

  /**
   * Request microphone access and initialize with timeout
   */
  async initialize(timeoutMs: number = 10000): Promise<MediaStream> {
    if (this.stream?.active) {
      return this.stream;
    }

    console.log('[AudioRecorder] Requesting microphone access...');

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Microphone permission timed out. Please allow microphone access and try again.'));
      }, timeoutMs);
    });

    // Create the getUserMedia promise
    const mediaPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000, // Optimal for speech recognition
      },
    });

    try {
      // Race between getUserMedia and timeout
      this.stream = await Promise.race([mediaPromise, timeoutPromise]);

      console.log('[AudioRecorder] Microphone initialized');
      return this.stream;
    } catch (error: any) {
      let message = 'Failed to access microphone';

      if (error.name === 'NotAllowedError') {
        message = 'Microphone permission denied. Please allow access in browser settings.';
      } else if (error.name === 'NotFoundError') {
        message = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        message = 'Microphone is in use by another application.';
      } else if (error.message?.includes('timed out')) {
        message = error.message;
      }

      console.error('[AudioRecorder] Initialization failed:', message);
      throw new Error(message);
    }
  }

  /**
   * Get the current media stream
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Start recording audio
   */
  start(): void {
    if (this.isRecording || !this.stream) {
      console.warn('[AudioRecorder] Cannot start: already recording or no stream');
      return;
    }

    this.chunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.options.mimeType,
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
          this.options.onDataAvailable?.(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: any) => {
        console.error('[AudioRecorder] Recording error:', event);
        this.options.onError?.(new Error('Recording failed'));
        this.isRecording = false;
      };

      this.mediaRecorder.onstop = () => {
        console.log('[AudioRecorder] Recording stopped');
        this.isRecording = false;
      };

      this.mediaRecorder.start(this.options.timeslice);
      this.isRecording = true;
      console.log('[AudioRecorder] Recording started');
    } catch (error: any) {
      console.error('[AudioRecorder] Start error:', error);
      this.options.onError?.(error);
    }
  }

  /**
   * Stop recording and return the audio blob
   */
  async stop(): Promise<Blob | null> {
    if (!this.isRecording || !this.mediaRecorder) {
      return null;
    }

    return new Promise((resolve) => {
      const recorder = this.mediaRecorder!;

      recorder.onstop = () => {
        this.isRecording = false;
        
        if (this.chunks.length === 0) {
          console.warn('[AudioRecorder] No audio recorded');
          resolve(null);
          return;
        }

        const blob = new Blob(this.chunks, { type: this.options.mimeType });
        console.log(`[AudioRecorder] Recording complete: ${blob.size} bytes`);
        this.chunks = [];
        resolve(blob);
      };

      if (recorder.state === 'recording') {
        recorder.stop();
      } else {
        resolve(null);
      }
    });
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current audio blob without stopping
   */
  getCurrentBlob(): Blob | null {
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this.options.mimeType });
  }

  /**
   * Clear recorded chunks
   */
  clearChunks(): void {
    this.chunks = [];
  }

  /**
   * Stop everything and release resources
   */
  cleanup(): void {
    if (this.mediaRecorder?.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // Ignore
      }
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    console.log('[AudioRecorder] Cleaned up');
  }
}

