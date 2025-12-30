/**
 * Text-to-Speech Service
 * ElevenLabs Multi-Context WebSocket API implementation
 * 
 * Implements real-time streaming with sentence-based flushing for
 * optimal audio quality and responsiveness.
 * 
 * Reference: https://elevenlabs.io/docs/api-reference/text-to-speech/multi-context-websocket
 */

import { TTSOptions, AudioChunk } from './types';

export class TextToSpeech {
  private ws: WebSocket | null = null;
  private options: Required<TTSOptions>;
  private isConnected = false;
  private isConnecting = false;
  private currentContextId: string | null = null;
  private pendingContexts: Set<string> = new Set();
  
  // Text buffer for sentence-based flushing
  private textBuffer: string = '';
  private lastFlushTime: number = 0;
  private readonly MIN_FLUSH_INTERVAL = 100; // Min ms between flushes

  // Callbacks
  private onAudioChunk?: (chunk: AudioChunk, contextId: string) => void;
  private onError?: (error: Error) => void;
  private onConnected?: () => void;
  private onDisconnected?: () => void;
  private onContextComplete?: (contextId: string) => void;

  constructor(options: TTSOptions) {
    this.options = {
      voiceId: options.voiceId,
      modelId: options.modelId ?? 'eleven_flash_v2_5',
      stability: options.stability ?? 0.5,
      similarityBoost: options.similarityBoost ?? 0.75,
      style: options.style ?? 0.0,
      speed: options.speed ?? 1.0,
    };
  }

  /**
   * Connect to ElevenLabs Multi-Context WebSocket
   */
  async connect(): Promise<void> {
    // Already connected
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      console.log('[TTS] Already connected');
      return;
    }

    // Already connecting
    if (this.isConnecting) {
      console.log('[TTS] Connection in progress...');
      // Wait for connection
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.isConnected) {
            clearInterval(checkInterval);
            resolve();
          } else if (!this.isConnecting) {
            clearInterval(checkInterval);
            reject(new Error('Connection failed'));
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error('Connection timeout'));
        }, 10000);
      });
    }

    // Close any existing connection first
    if (this.ws) {
      console.log('[TTS] Closing existing connection...');
      this.forceClose();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isConnecting = true;

    return new Promise(async (resolve, reject) => {
      // Get API key
      let apiKey: string | null = null;
      try {
        const response = await fetch('/api/voice/websocket-key');
        if (response.ok) {
          const data = await response.json();
          apiKey = data.apiKey;
        }
      } catch (error) {
        console.error('[TTS] Failed to get API key:', error);
        this.isConnecting = false;
        reject(new Error('Failed to get API key'));
        return;
      }

      if (!apiKey) {
        this.isConnecting = false;
        reject(new Error('ElevenLabs API key not available'));
        return;
      }

      // Build WebSocket URL with 180s timeout
      const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.options.voiceId}/multi-stream-input?model_id=${this.options.modelId}&inactivity_timeout=180`;

      console.log('[TTS] Connecting to ElevenLabs...');

      try {
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('[TTS] Connection timeout');
            this.forceClose();
            this.isConnecting = false;
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[TTS] ✅ WebSocket connected');
          
          // Authenticate with API key
          this.ws!.send(JSON.stringify({ xi_api_key: apiKey }));

          this.isConnected = true;
          this.isConnecting = false;
          this.onConnected?.();
          
          console.log('[TTS] ✅ Ready for streaming');
          resolve();
        };

        this.ws.onmessage = (event) => this.handleMessage(event);

        this.ws.onerror = (error) => {
          console.error('[TTS] ❌ WebSocket error:', error);
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.onError?.(new Error('WebSocket error'));
        };

        this.ws.onclose = (event) => {
          console.log('[TTS] WebSocket closed:', event.code, event.reason);
          clearTimeout(connectionTimeout);
          this.isConnected = false;
          this.isConnecting = false;
          this.currentContextId = null;
          this.pendingContexts.clear();
          this.textBuffer = '';
          this.onDisconnected?.();
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      const contextId = data.contextId || 'default';

      // Audio chunk received - send to player immediately
      if (data.audio) {
        const audioBuffer = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        console.log(`[TTS] 🔊 Audio: ${audioBuffer.byteLength} bytes`);
        
        this.onAudioChunk?.(
          {
            audio: audioBuffer.buffer,
            isFinal: data.is_final || false,
          },
          contextId
        );
      }

      // Context completed
      if (data.is_final) {
        console.log(`[TTS] ✅ Context '${contextId}' complete`);
        this.pendingContexts.delete(contextId);
        this.onContextComplete?.(contextId);
      }

      // Server error
      if (data.error) {
        console.error('[TTS] ❌ Server error:', data.error);
        
        if (data.error === 'max_active_conversations') {
          console.warn('[TTS] ⚠️ Too many connections - close other tabs and wait 60s');
        }
        
        this.onError?.(new Error(data.error));
      }
    } catch (error) {
      console.error('[TTS] Parse error:', error);
    }
  }

  /**
   * Create a new context for streaming
   */
  createContext(contextId?: string): string {
    const id = contextId || `ctx_${Date.now()}`;
    this.currentContextId = id;
    this.pendingContexts.add(id);
    this.textBuffer = '';
    console.log(`[TTS] 📝 New context: ${id}`);
    return id;
  }

  /**
   * Stream text in real-time
   * Buffers text and flushes on sentence boundaries for optimal audio quality
   * 
   * @param text - Text chunk to stream (usually from OpenAI token)
   * @param contextId - Context ID
   * @param isFirst - Whether this is the first chunk (includes voice settings)
   */
  streamText(text: string, contextId?: string, isFirst: boolean = false): void {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[TTS] Not connected, attempting to connect...');
      this.connect().then(() => {
        this.streamText(text, contextId, isFirst);
      }).catch(err => {
        console.error('[TTS] Connection failed:', err);
      });
      return;
    }

    const ctxId = contextId || this.currentContextId;
    if (!ctxId) {
      console.warn('[TTS] No context, creating one...');
      this.createContext();
    }

    const finalCtxId = ctxId || this.currentContextId!;

    // Add to buffer
    this.textBuffer += text;

    // Build message
    const message: any = {
      text: text,
      context_id: finalCtxId,
    };

    // Include voice settings on first message
    if (isFirst) {
      message.voice_settings = {
        stability: this.options.stability,
        similarity_boost: this.options.similarityBoost,
        style: this.options.style,
        use_speaker_boost: true,
      };
      console.log(`[TTS] 📤 First: "${text}"`);
    }

    try {
      this.ws.send(JSON.stringify(message));

      // Check for sentence boundary to flush
      const sentenceEnders = ['.', '!', '?', ':', ';', '\n'];
      const shouldFlush = sentenceEnders.some(end => this.textBuffer.trim().endsWith(end));
      const now = Date.now();

      if (shouldFlush && (now - this.lastFlushTime) > this.MIN_FLUSH_INTERVAL) {
        this.flushContext(finalCtxId);
        this.textBuffer = '';
        this.lastFlushTime = now;
      }
    } catch (error) {
      console.error('[TTS] Send error:', error);
    }
  }

  /**
   * Flush context to generate buffered audio
   */
  flushContext(contextId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const ctxId = contextId || this.currentContextId;
    if (!ctxId) return;

    console.log(`[TTS] 🚿 Flush: ${ctxId}`);
    this.ws.send(JSON.stringify({
      context_id: ctxId,
      flush: true,
    }));
  }

  /**
   * Close context and finalize
   */
  closeContext(contextId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const ctxId = contextId || this.currentContextId;
    if (!ctxId) return;

    console.log(`[TTS] 🔒 Close context: ${ctxId}`);
    this.ws.send(JSON.stringify({
      context_id: ctxId,
      close_context: true,
    }));
    
    this.pendingContexts.delete(ctxId);
    if (this.currentContextId === ctxId) {
      this.currentContextId = null;
    }
    this.textBuffer = '';
  }

  /**
   * Handle user interruption (barge-in)
   * Closes current context and prepares for new response
   */
  handleBargeIn(oldContextId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    console.log(`[TTS] ⚡ Barge-in: closing ${oldContextId}`);
    
    // Close the interrupted context
    this.ws.send(JSON.stringify({
      context_id: oldContextId,
      close_context: true,
    }));
    
    this.pendingContexts.delete(oldContextId);
    this.currentContextId = null;
    this.textBuffer = '';
  }

  /**
   * Keep context alive (prevent timeout)
   */
  keepAlive(contextId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const ctxId = contextId || this.currentContextId;
    if (!ctxId) return;

    this.ws.send(JSON.stringify({
      context_id: ctxId,
      text: "",
    }));
  }

  /**
   * Force close WebSocket
   */
  private forceClose(): void {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ close_socket: true }));
        }
      } catch (e) { /* ignore */ }
      
      try {
        this.ws.close(1000, 'Intentional close');
      } catch (e) { /* ignore */ }
      
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws = null;
    }
    
    this.isConnected = false;
    this.currentContextId = null;
    this.pendingContexts.clear();
    this.textBuffer = '';
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[TTS] Disconnecting...');
    this.forceClose();
    console.log('[TTS] Disconnected');
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current context ID
   */
  getCurrentContextId(): string | null {
    return this.currentContextId;
  }

  // Callback setters
  setOnAudioChunk(cb: (chunk: AudioChunk, contextId: string) => void): void {
    this.onAudioChunk = cb;
  }

  setOnError(cb: (error: Error) => void): void {
    this.onError = cb;
  }

  setOnConnected(cb: () => void): void {
    this.onConnected = cb;
  }

  setOnDisconnected(cb: () => void): void {
    this.onDisconnected = cb;
  }

  setOnContextComplete(cb: (contextId: string) => void): void {
    this.onContextComplete = cb;
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.disconnect();
    this.onAudioChunk = undefined;
    this.onError = undefined;
    this.onConnected = undefined;
    this.onDisconnected = undefined;
    this.onContextComplete = undefined;
    console.log('[TTS] Cleaned up');
  }
}
