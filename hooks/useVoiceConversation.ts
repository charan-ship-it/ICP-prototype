/**
 * useVoiceConversation Hook
 * Clean, unified voice conversation management with ElevenLabs Multi-Context TTS
 * 
 * Flow: idle → listening → processing → speaking → listening (loop)
 *                              ↑                ↓
 *                              ←← barge-in ←←←←
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  VoiceState,
  VoiceConversationOptions,
  VoiceConversationReturn,
} from '@/lib/voice/types';
import { VoiceStateMachine } from '@/lib/voice/VoiceStateMachine';
import { AudioRecorder } from '@/lib/voice/AudioRecorder';
import { AudioPlayer } from '@/lib/voice/AudioPlayer';
import { VAD } from '@/lib/voice/VAD';
import { SpeechToText } from '@/lib/voice/SpeechToText';
import { TextToSpeech } from '@/lib/voice/TextToSpeech';

const DEFAULT_VOICE_ID = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

export function useVoiceConversation(
  options: VoiceConversationOptions = {}
): VoiceConversationReturn {
  const { onTranscript, onStateChange, onError, onAudioChunkReceived, ttsOptions, sttOptions, vadOptions } = options;

  // State
  const [state, setState] = useState<VoiceState>('idle');
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for mutable objects
  const stateMachineRef = useRef<VoiceStateMachine | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const vadRef = useRef<VAD | null>(null);
  const sttRef = useRef<SpeechToText | null>(null);
  const ttsRef = useRef<TextToSpeech | null>(null);
  const isActiveRef = useRef(false); // Keep ref for sync access in callbacks
  const currentTTSContextRef = useRef<string | null>(null);
  const isFirstChunkRef = useRef(true);

  // Refs for callbacks (avoid stale closures)
  const onTranscriptRef = useRef(onTranscript);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const onAudioChunkReceivedRef = useRef(onAudioChunkReceived);

  // Update callback refs
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onStateChangeRef.current = onStateChange;
    onErrorRef.current = onError;
    onAudioChunkReceivedRef.current = onAudioChunkReceived;
  }, [onTranscript, onStateChange, onError, onAudioChunkReceived]);

  /**
   * Initialize all voice components
   */
  const initializeComponents = useCallback(async () => {
    // State machine
    if (!stateMachineRef.current) {
      stateMachineRef.current = new VoiceStateMachine();
      stateMachineRef.current.subscribe((newState) => {
        setState(newState);
        onStateChangeRef.current?.(newState);
      });
    }

    // Audio recorder
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder({
        onError: (err) => {
          console.error('[Voice] Recorder error:', err);
          setError(err);
          onErrorRef.current?.(err);
        },
      });
    }

    // Audio player
    if (!playerRef.current) {
      playerRef.current = new AudioPlayer({
        onPlaybackStart: () => {
          console.log('[Voice] Audio playback started');
        },
        onPlaybackEnd: () => {
          console.log('[Voice] Audio playback ended');
          // Return to listening after AI finishes speaking
          if (isActiveRef.current && stateMachineRef.current?.getState() === 'speaking') {
            stateMachineRef.current.transition('listening', 'playback ended');
            
            // Reset for next response
            currentTTSContextRef.current = null;
            isFirstChunkRef.current = true;
            
            // Restart recording for next user turn
            if (recorderRef.current) {
              recorderRef.current.start();
            }
            if (vadRef.current) {
              vadRef.current.start();
            }
          }
        },
        onError: (err) => {
          console.error('[Voice] Player error:', err);
          onErrorRef.current?.(err);
        },
      });
      await playerRef.current.initialize();
    }

    // Speech-to-text
    if (!sttRef.current) {
      sttRef.current = new SpeechToText({
        language: sttOptions?.language ?? 'en',
        model: sttOptions?.model ?? 'scribe_v1',
      });
    }

    // Text-to-speech with multi-context support
    if (!ttsRef.current) {
      ttsRef.current = new TextToSpeech({
        voiceId: ttsOptions?.voiceId ?? DEFAULT_VOICE_ID,
        modelId: ttsOptions?.modelId ?? 'eleven_flash_v2_5', // Use flash for lower latency
        stability: ttsOptions?.stability ?? 0.5,
        similarityBoost: ttsOptions?.similarityBoost ?? 0.75,
        style: ttsOptions?.style ?? 0.0,
        speed: ttsOptions?.speed ?? 1.0,
      });

      // Handle audio chunks - play them and notify parent for text sync
      ttsRef.current.setOnAudioChunk((chunk, contextId) => {
        const state = stateMachineRef.current?.getState();
        
        // Queue audio if we're speaking or processing
        if (
          (state === 'speaking' || state === 'processing') &&
          playerRef.current
        ) {
          // If still in processing, transition to speaking
          if (state === 'processing') {
            console.log('[Voice] 🎤 First audio - starting speech');
            stateMachineRef.current?.transition('speaking', 'audio received');
          }
          
          playerRef.current.queueChunk(chunk.audio);
          
          // Notify parent that audio is being received - for text synchronization
          // Parent can use this to reveal text in sync with audio
          onAudioChunkReceivedRef.current?.();
        }
      });

      ttsRef.current.setOnContextComplete((contextId) => {
        console.log(`[Voice] TTS context complete: ${contextId}`);
      });

      ttsRef.current.setOnError((err) => {
        console.error('[Voice] TTS error:', err);
        onErrorRef.current?.(err);
      });
    }
  }, [sttOptions, ttsOptions]);

  /**
   * Handle speech end - transcribe and send
   */
  const handleSpeechEnd = useCallback(async () => {
    console.log('[Voice] handleSpeechEnd called');
    
    if (!isActiveRef.current) {
      console.log('[Voice] Not active, skipping');
      return;
    }
    
    if (!recorderRef.current) {
      console.log('[Voice] No recorder, skipping');
      return;
    }
    
    if (!sttRef.current) {
      console.log('[Voice] No STT, skipping');
      return;
    }

    console.log('[Voice] 📝 Speech ended, transcribing...');
    
    // Transition to processing
    stateMachineRef.current?.transition('processing', 'speech ended');

    // Stop VAD while processing
    vadRef.current?.stop();

    // Stop recording and get audio
    const audioBlob = await recorderRef.current.stop();
    console.log(`[Voice] Audio blob size: ${audioBlob?.size || 0} bytes`);

    if (!audioBlob || audioBlob.size < 1000) {
      console.log('[Voice] ⚠️ Audio too short, returning to listening');
      stateMachineRef.current?.transition('listening', 'audio too short');
      recorderRef.current.start();
      vadRef.current?.start();
      return;
    }

    try {
      // Transcribe with ElevenLabs STT
      console.log('[Voice] 🔄 Sending to ElevenLabs STT...');
      const result = await sttRef.current.transcribe(audioBlob);

      if (!result.text || result.text.trim().length === 0) {
        console.log('[Voice] ⚠️ Empty transcription, returning to listening');
        stateMachineRef.current?.transition('listening', 'empty transcription');
        recorderRef.current?.start();
        vadRef.current?.start();
        return;
      }

      console.log(`[Voice] ✅ Transcription: "${result.text}"`);

      // Notify parent with transcript - this will trigger the AI response
      onTranscriptRef.current?.(result.text);

      // Safety timeout: If TTS doesn't start within 15 seconds, return to listening
      // This handles cases where the message fails to send or AI doesn't respond
      const safetyTimeout = setTimeout(() => {
        if (stateMachineRef.current?.getState() === 'processing') {
          console.log('[Voice] ⚠️ Safety timeout - no TTS response, returning to listening');
          stateMachineRef.current?.transition('listening', 'safety timeout');
          recorderRef.current?.start();
          vadRef.current?.start();
        }
      }, 15000);

      // Clear timeout when state changes (stored in ref for cleanup if needed)
      const originalOnStateChange = onStateChangeRef.current;
      onStateChangeRef.current = (newState) => {
        if (newState !== 'processing') {
          clearTimeout(safetyTimeout);
          onStateChangeRef.current = originalOnStateChange;
        }
        originalOnStateChange?.(newState);
      };
    } catch (err: any) {
      console.error('[Voice] ❌ Transcription failed:', err);
      setError(err);
      onErrorRef.current?.(err);
      
      // Return to listening on error
      stateMachineRef.current?.transition('listening', 'transcription error');
      recorderRef.current?.start();
      vadRef.current?.start();
    }
  }, []);

  /**
   * Start voice conversation
   */
  const start = useCallback(async () => {
    if (isActiveRef.current) {
      console.log('[Voice] Already active');
      return;
    }

    console.log('[Voice] Starting conversation...');
    setError(null);

    try {
      await initializeComponents();

      // Initialize microphone
      const stream = await recorderRef.current!.initialize();

      // Initialize Adaptive VAD - automatically calibrates to ambient noise
      vadRef.current = new VAD({
        onSpeechStart: () => {
          console.log('[Voice] 🎤 Speech detected - user is speaking');
          // Transition to listening if not already
          if (stateMachineRef.current?.getState() === 'idle') {
            stateMachineRef.current.transition('listening', 'speech started');
          }
        },
        onSpeechEnd: () => {
          console.log('[Voice] 🔇 Speech ended - processing...');
          handleSpeechEnd();
        },
        onSilenceTimeout: () => {
          console.log('[Voice] ⏱️ Silence timeout triggered');
        },
        energyThreshold: vadOptions?.energyThreshold ?? 0.01, // Minimum threshold (adaptive will be higher)
        speechStartDelay: vadOptions?.speechStartDelay ?? 100, // Fast speech detection
        silenceTimeout: vadOptions?.silenceTimeout ?? 1200, // 1.2 seconds of silence before sending
      });

      await vadRef.current.initialize(stream);

      // Connect TTS (will establish WebSocket)
      await ttsRef.current!.connect();

      // Start listening
      isActiveRef.current = true;
      setIsActive(true);
      recorderRef.current!.start();
      vadRef.current.start();

      // Start live preview if available
      sttRef.current?.startLivePreview((text) => {
        // Could update a live transcript state here
      });

      stateMachineRef.current!.transition('listening', 'conversation started');
      console.log('[Voice] Conversation started');
    } catch (err: any) {
      console.error('[Voice] Failed to start:', err);
      isActiveRef.current = false;
      setIsActive(false);
      setError(err);
      onErrorRef.current?.(err);
      stateMachineRef.current?.forceTransition('error', err.message);
      throw err;
    }
  }, [initializeComponents, handleSpeechEnd, vadOptions]);

  /**
   * Stop voice conversation
   */
  const stop = useCallback(() => {
    console.log('[Voice] Stopping conversation...');
    isActiveRef.current = false;
    setIsActive(false);

    // Close TTS properly
    ttsRef.current?.disconnect();

    // Stop all components
    vadRef.current?.cleanup();
    recorderRef.current?.cleanup();
    playerRef.current?.cleanup();
    sttRef.current?.cleanup();
    ttsRef.current?.cleanup();

    // Clear refs
    vadRef.current = null;
    recorderRef.current = null;
    playerRef.current = null;
    sttRef.current = null;
    ttsRef.current = null;
    currentTTSContextRef.current = null;
    isFirstChunkRef.current = true;

    stateMachineRef.current?.forceTransition('idle', 'conversation stopped');
    console.log('[Voice] Conversation stopped');
  }, []);

  /**
   * Pause conversation (keep resources, stop listening)
   */
  const pause = useCallback(() => {
    if (!isActiveRef.current) return;

    console.log('[Voice] Pausing...');
    vadRef.current?.stop();
    recorderRef.current?.stop();
    playerRef.current?.pause();
    sttRef.current?.stopLivePreview();

    stateMachineRef.current?.transition('idle', 'paused');
  }, []);

  /**
   * Resume conversation
   */
  const resume = useCallback(async () => {
    if (!isActiveRef.current) {
      await start();
      return;
    }

    console.log('[Voice] Resuming...');
    await playerRef.current?.resume();
    recorderRef.current?.start();
    vadRef.current?.start();
    sttRef.current?.startLivePreview(() => {});

    stateMachineRef.current?.transition('listening', 'resumed');
  }, [start]);

  /**
   * Stream text to TTS in real-time (called from parent during OpenAI streaming)
   * Each token is sent immediately to TTS for real-time speech synthesis
   */
  const streamText = useCallback((text: string) => {
    if (!isActiveRef.current) {
      return; // Silent return - voice not active
    }
    
    if (!ttsRef.current) {
      console.warn('[Voice] No TTS available');
      return;
    }

    const currentState = stateMachineRef.current?.getState();

    // First chunk: transition to speaking and create context
    if (currentState === 'processing' || currentState === 'listening') {
      console.log('[Voice] 🎤 Starting TTS stream...');
      stateMachineRef.current?.transition('speaking', 'TTS started');
      playerRef.current?.reset(); // Allow new audio
      
      // Create new context for this response
      currentTTSContextRef.current = ttsRef.current.createContext();
      isFirstChunkRef.current = true;
    }

    // Stream text immediately to TTS (sentence-based flushing is handled internally)
    ttsRef.current.streamText(
      text, 
      currentTTSContextRef.current || undefined, 
      isFirstChunkRef.current
    );
    isFirstChunkRef.current = false;
  }, []);

  /**
   * Flush remaining text and close context (called when AI response is complete)
   */
  const flushText = useCallback(() => {
    if (ttsRef.current && currentTTSContextRef.current) {
      console.log(`[Voice] 🚿 Flushing and closing context: ${currentTTSContextRef.current}`);
      
      // Flush to generate any buffered audio
      ttsRef.current.flushContext(currentTTSContextRef.current);
      
      // Close the context (audio will continue playing, listening resumes in onPlaybackEnd)
      ttsRef.current.closeContext(currentTTSContextRef.current);
    }
  }, []);

  /**
   * Force end speech (manual trigger when VAD doesn't detect)
   */
  const forceEndSpeech = useCallback(() => {
    console.log('[Voice] 🔘 Manual send triggered');
    handleSpeechEnd();
  }, [handleSpeechEnd]);

  /**
   * Interrupt playback (barge-in) - stops AI speech immediately
   */
  const interruptPlayback = useCallback(() => {
    if (!isActiveRef.current) return;

    console.log('[Voice] ⚡ Barge-in triggered');

    // Stop audio playback immediately
    playerRef.current?.stop();

    // Handle barge-in on TTS (closes context properly per docs)
    if (ttsRef.current && currentTTSContextRef.current) {
      ttsRef.current.handleBargeIn(currentTTSContextRef.current);
    }
    currentTTSContextRef.current = null;
    isFirstChunkRef.current = true;

    // Reset player for new audio
    playerRef.current?.reset();

    // Transition to listening
    if (stateMachineRef.current?.getState() === 'speaking') {
      stateMachineRef.current.transition('listening', 'barge-in');
    }

    // Start listening again
    recorderRef.current?.clearChunks();
    recorderRef.current?.start();
    vadRef.current?.start();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isActiveRef.current) {
        stop();
      }
    };
  }, [stop]);

  return {
    state,
    isActive,
    error,
    start,
    stop,
    pause,
    resume,
    streamText,
    flushText,
    interruptPlayback,
    forceEndSpeech,
  };
}
