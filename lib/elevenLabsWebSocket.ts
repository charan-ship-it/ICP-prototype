/**
 * Eleven Labs WebSocket Manager for Text-to-Speech
 * Handles real-time TTS streaming with Multi-Context support for barge-in
 */

export interface TTSOptions {
  voiceId: string;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speed?: number;
  };
}

export interface AudioChunk {
  audio: ArrayBuffer;
  isFinal: boolean;
}

export class ElevenLabsWebSocketManager {
  private ws: WebSocket | null = null;
  private currentContextId: string | null = null;
  private contexts: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private options: TTSOptions;

  // Callbacks
  private onAudioChunkCallback?: (chunk: AudioChunk) => void;
  private onErrorCallback?: (error: Error) => void;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;

  constructor(options: TTSOptions) {
    this.options = {
      voiceId: options.voiceId,
      modelId: options.modelId || 'eleven_multilingual_v2',
      voiceSettings: {
        stability: options.voiceSettings?.stability ?? 0.5,
        similarityBoost: options.voiceSettings?.similarityBoost ?? 0.75,
        style: options.voiceSettings?.style ?? 0.0,
        useSpeakerBoost: options.voiceSettings?.useSpeakerBoost ?? true,
        speed: options.voiceSettings?.speed ?? 1.0,
      },
    };
  }

  /**
   * Connect to Eleven Labs WebSocket
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const modelId = this.options.modelId || 'eleven_multilingual_v2';
      // WebSocket URL - API key will be sent in the initial message
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.options.voiceId}/stream-input?model_id=${modelId}`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = async () => {
          console.log('[ElevenLabs WS] Connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Send initial configuration
          await this.sendConfiguration();
          
          // Start keep-alive
          this.startKeepAlive();
          
          this.onConnectCallback?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          console.error('[ElevenLabs WS] Error:', error);
          this.onErrorCallback?.(new Error('WebSocket error occurred'));
        };

        this.ws.onclose = (event) => {
          console.log('[ElevenLabs WS] Disconnected', event.code, event.reason);
          this.isConnected = false;
          this.stopKeepAlive();
          this.onDisconnectCallback?.();
          
          // Attempt reconnect if not intentional
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = 1000 * this.reconnectAttempts;
            console.log(`[ElevenLabs WS] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            setTimeout(() => {
              this.connect().catch((error) => {
                console.error('[ElevenLabs WS] Reconnection failed:', error);
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                  this.onErrorCallback?.(new Error('Failed to reconnect after multiple attempts'));
                }
              });
            }, delay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.onErrorCallback?.(new Error('WebSocket connection lost and reconnection failed'));
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send initial configuration
   */
  private async sendConfiguration(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Get API key from server endpoint
    let apiKey: string | null = null;
    try {
      const response = await fetch('/api/voice/websocket-key');
      if (response.ok) {
        const data = await response.json();
        apiKey = data.apiKey || null;
      }
    } catch (error) {
      console.error('[ElevenLabs WS] Failed to get API key:', error);
    }

    if (!apiKey) {
      console.warn('[ElevenLabs WS] API key not found - TTS may not work');
    }

    const config: any = {
      text: ' ',
      voice_settings: this.options.voiceSettings,
      generation_config: {
        chunk_length_schedule: [120, 160, 250, 290],
      },
    };

    // Add API key to config (Eleven Labs expects it in the message)
    if (apiKey) {
      config.xi_api_key = apiKey;
    }

    this.ws.send(JSON.stringify(config));
  }

  /**
   * Create a new context for speech
   */
  createContext(): string {
    const contextId = `context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.contexts.add(contextId);
    this.currentContextId = contextId;
    return contextId;
  }

  /**
   * Close a specific context (for barge-in)
   */
  closeContext(contextId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.contexts.has(contextId)) {
      // Send flush with empty text to close context
      this.ws.send(JSON.stringify({ text: '', flush: true }));
      this.contexts.delete(contextId);
      
      if (this.currentContextId === contextId) {
        this.currentContextId = null;
      }
    }
  }

  /**
   * Close current context (for barge-in)
   */
  closeCurrentContext(): void {
    if (this.currentContextId) {
      this.closeContext(this.currentContextId);
    }
  }

  /**
   * Send text chunk to TTS
   */
  sendText(text: string, flush: boolean = false, contextId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ElevenLabs WS] Cannot send text: WebSocket not connected');
      return;
    }

    // Use provided context or current context
    const activeContextId = contextId || this.currentContextId;
    if (!activeContextId) {
      console.warn('[ElevenLabs WS] No active context, creating one');
      this.createContext();
    }

    const message: any = {
      text: text,
    };

    if (flush) {
      message.flush = true;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (event.data instanceof ArrayBuffer) {
        // Audio chunk received
        const isFinal = false; // We'll determine this from message type if available
        this.onAudioChunkCallback?.({
          audio: event.data,
          isFinal,
        });
      } else if (typeof event.data === 'string') {
        // Text message (status, errors, etc.)
        const data = JSON.parse(event.data);
        
        if (data.audio) {
          // Base64 encoded audio
          const audioBuffer = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
          this.onAudioChunkCallback?.({
            audio: audioBuffer.buffer,
            isFinal: data.is_final || false,
          });
        } else if (data.error) {
          this.onErrorCallback?.(new Error(data.error));
        }
      }
    } catch (error) {
      console.error('[ElevenLabs WS] Error handling message:', error);
    }
  }

  /**
   * Start keep-alive mechanism (send space every 20 seconds)
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ text: ' ' }));
      }
    }, 20000); // 20 seconds
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopKeepAlive();
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }
    this.isConnected = false;
    this.contexts.clear();
    this.currentContextId = null;
  }

  /**
   * Set callback for audio chunks
   */
  onAudioChunk(callback: (chunk: AudioChunk) => void): void {
    this.onAudioChunkCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Set callback for connection
   */
  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  /**
   * Set callback for disconnection
   */
  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current context ID
   */
  getCurrentContextId(): string | null {
    return this.currentContextId;
  }
}

