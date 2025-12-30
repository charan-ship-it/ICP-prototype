/**
 * Speech-to-Text Service
 * Uses ElevenLabs STT API for cross-browser support
 * Falls back to browser SpeechRecognition for live preview where available
 */

import { STTOptions, TranscriptionResult } from './types';

export class SpeechToText {
  private options: STTOptions;
  private browserRecognition: any = null;
  private isListening = false;
  private onInterimTranscript?: (text: string) => void;

  constructor(options: STTOptions = {}) {
    this.options = {
      language: options.language ?? 'en',
      model: options.model ?? 'scribe_v1',
    };

    // Initialize browser speech recognition for live preview (optional)
    this.initBrowserRecognition();
  }

  /**
   * Initialize browser SpeechRecognition for live preview
   */
  private initBrowserRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.log('[STT] Browser SpeechRecognition not available');
      return;
    }

    try {
      this.browserRecognition = new SpeechRecognition();
      this.browserRecognition.continuous = true;
      this.browserRecognition.interimResults = true;
      this.browserRecognition.lang = this.options.language === 'en' ? 'en-US' : this.options.language;

      this.browserRecognition.onresult = (event: any) => {
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (!event.results[i].isFinal) {
            interimText += transcript;
          }
        }

        if (interimText && this.onInterimTranscript) {
          this.onInterimTranscript(interimText);
        }
      };

      this.browserRecognition.onerror = (event: any) => {
        // Only log non-trivial errors
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('[STT] Browser recognition error:', event.error);
        }
      };

      this.browserRecognition.onend = () => {
        // Restart if still listening
        if (this.isListening && this.browserRecognition) {
          try {
            this.browserRecognition.start();
          } catch (e) {
            // Already started or error
          }
        }
      };

      console.log('[STT] Browser SpeechRecognition initialized');
    } catch (error) {
      console.warn('[STT] Failed to initialize browser recognition:', error);
    }
  }

  /**
   * Start browser recognition for live preview
   */
  startLivePreview(onInterimTranscript: (text: string) => void): void {
    this.onInterimTranscript = onInterimTranscript;
    this.isListening = true;

    if (this.browserRecognition) {
      try {
        this.browserRecognition.start();
        console.log('[STT] Live preview started');
      } catch (error) {
        console.warn('[STT] Could not start live preview:', error);
      }
    }
  }

  /**
   * Stop browser recognition
   */
  stopLivePreview(): void {
    this.isListening = false;
    this.onInterimTranscript = undefined;

    if (this.browserRecognition) {
      try {
        this.browserRecognition.stop();
        console.log('[STT] Live preview stopped');
      } catch (e) {
        // Ignore
      }
    }
  }

  /**
   * Transcribe audio blob using ElevenLabs STT API
   */
  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    console.log(`[STT] Transcribing ${audioBlob.size} bytes...`);

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model_id', this.options.model || 'scribe_v1');
    
    if (this.options.language) {
      formData.append('language_code', this.options.language);
    }

    try {
      const response = await fetch('/api/stt/elevenlabs', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `STT failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[STT] Transcription complete: "${data.text?.substring(0, 50)}..."`);

      return {
        text: data.text || '',
        confidence: data.confidence,
        language: data.language_code,
      };
    } catch (error: any) {
      console.error('[STT] Transcription error:', error);
      throw error;
    }
  }

  /**
   * Check if browser speech recognition is available
   */
  static isBrowserSTTAvailable(): boolean {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.stopLivePreview();
    this.browserRecognition = null;
    console.log('[STT] Cleaned up');
  }
}

