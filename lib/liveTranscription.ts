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
        console.error('[LiveTranscription] Error:', event.error);
        this.options.onError?.(new Error(`Speech recognition error: ${event.error}`));
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

