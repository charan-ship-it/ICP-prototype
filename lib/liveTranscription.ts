/**
 * Live Transcription using Browser SpeechRecognition API
 * Provides real-time transcription as user speaks (like ChatGPT Voice)
 */

export interface LiveTranscriptionOptions {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: Error) => void;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

export class LiveTranscription {
  private recognition: any = null;
  private isActive: boolean = false;
  private options: LiveTranscriptionOptions;

  constructor(options: LiveTranscriptionOptions) {
    this.options = options;
    this.initializeRecognition();
  }

  private initializeRecognition(): void {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('[LiveTranscription] SpeechRecognition API not supported in this browser');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = this.options.continuous ?? true;
      this.recognition.interimResults = this.options.interimResults ?? true;
      this.recognition.lang = this.options.language || 'en-US';

      // Handle results
      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Send final transcript
        if (finalTranscript.trim()) {
          this.options.onTranscript(finalTranscript.trim(), true);
        }
        
        // Send interim transcript for live preview
        if (interimTranscript.trim()) {
          this.options.onTranscript(interimTranscript.trim(), false);
        }
      };

      // Handle errors
      this.recognition.onerror = (event: any) => {
        // Handle common non-critical errors gracefully
        const errorType = event.error;
        
        // "no-speech" is a common, non-critical error when user doesn't speak
        // It's expected behavior, not a real error
        if (errorType === 'no-speech') {
          // Silently ignore - this is expected when user pauses
          return;
        }
        
        // "aborted" is also expected when we intentionally stop
        if (errorType === 'aborted') {
          return;
        }
        
        // Log other errors but don't treat as critical
        if (errorType === 'audio-capture' || errorType === 'network') {
          console.warn('[LiveTranscription] Error (non-critical):', errorType);
          // These are recoverable - don't call onError
          return;
        }
        
        // Only log actual errors
        console.error('[LiveTranscription] Error:', errorType);
        // Only call onError for unexpected errors
        if (errorType !== 'not-allowed' && errorType !== 'service-not-allowed') {
          this.options.onError?.(new Error(`Speech recognition error: ${errorType}`));
        }
      };

      // Handle end
      this.recognition.onend = () => {
        if (this.isActive) {
          // Restart if still active
          try {
            this.recognition.start();
          } catch (e) {
            // Already started or error
            console.warn('[LiveTranscription] Could not restart:', e);
          }
        }
      };

      // Handle start
      this.recognition.onstart = () => {
        console.log('[LiveTranscription] Started');
      };
    } catch (error) {
      console.error('[LiveTranscription] Initialization error:', error);
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Start live transcription
   */
  start(): void {
    if (!this.recognition) {
      console.warn('[LiveTranscription] Cannot start: SpeechRecognition not available');
      return;
    }

    if (this.isActive) {
      return;
    }

    try {
      this.isActive = true;
      this.recognition.start();
      console.log('[LiveTranscription] Starting...');
    } catch (error) {
      console.error('[LiveTranscription] Start error:', error);
      this.isActive = false;
    }
  }

  /**
   * Stop live transcription
   */
  stop(): void {
    if (!this.recognition || !this.isActive) {
      return;
    }

    try {
      this.isActive = false;
      this.recognition.stop();
      console.log('[LiveTranscription] Stopped');
    } catch (error) {
      console.error('[LiveTranscription] Stop error:', error);
    }
  }

  /**
   * Check if SpeechRecognition is supported
   */
  static isSupported(): boolean {
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  }

  /**
   * Get current active state
   */
  getIsActive(): boolean {
    return this.isActive;
  }
}

