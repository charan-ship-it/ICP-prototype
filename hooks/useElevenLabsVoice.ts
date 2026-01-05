'use client';

/**
 * useElevenLabsVoice Hook - ChatGPT-like Voice Mode
 * 
 * Flow: idle → listening → processing → speaking → listening (loop)
 * 
 * Key behaviors (like ChatGPT):
 * 1. Listen to complete utterance (no live transcription display)
 * 2. Use VAD to detect when user finishes speaking
 * 3. Send complete audio to ElevenLabs STT
 * 4. Stream LLM response directly to TTS with minimal buffering
 * 5. AI speaks while generating (not text-first-then-speak)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ElevenLabsWebSocketManager, TTSOptions } from '@/lib/elevenLabsWebSocket';
import { TextBuffer } from '@/lib/textBuffer';
import { AudioPlayer } from '@/lib/audioPlayer';
import { voiceLogger } from '@/lib/voiceLogger';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface UseElevenLabsVoiceOptions {
  onTranscriptComplete?: (text: string) => void;
  onBargeIn?: () => void;
  onError?: (error: Error) => void;
  onTextSpoken?: (spokenText: string) => void;
  onSpeakingComplete?: (finalText: string) => void; // Called when voice finishes speaking
  sessionId: string | null;
  voiceId?: string;
  modelId?: string;
}

/**
 * VAD Configuration - Research-Backed Optimal Settings
 * 
 * Based on industry standards and best practices for real-time voice conversations:
 * - Energy threshold: 0.05-0.10 range for normal speech detection (we use 0.06)
 * - Noise multiplier: 2.0-2.5x for balanced sensitivity (we use 2.2)
 * - Silence duration: 800-1200ms optimal for conversational apps (we use 1000ms like ChatGPT)
 * - Speech start confirmation: 100-150ms sufficient (we use 120ms)
 * - Min speech duration: 300-500ms to filter brief sounds (we use 400ms, allows "yes", "no", "ok")
 */
const VAD_CONFIG = {
  energyThreshold: 0.06,        // Lower baseline (research: 0.05-0.10) - was 0.20 (too high)
  speechStartMs: 120,           // Faster confirmation (100-150ms optimal) - was 200ms
  silenceEndMs: 1000,           // 1s silence (ChatGPT-like, research: 800-1200ms) - was 1500ms
  minRecordingMs: 300,          // Minimum 300ms recording (reasonable minimum) - was 500ms
  minSpeechDurationMs: 400,     // Lower to 400ms (allows short responses like "yes") - was 800ms
  noiseMultiplier: 2.2,         // More balanced (research: 2.0-2.5x) - was 3.5 (too high)
  debugLogging: false,          // Disabled by default to reduce console overhead and improve latency
};

export function useElevenLabsVoice(options: UseElevenLabsVoiceOptions) {
  const {
    onTranscriptComplete,
    onBargeIn,
    onError,
    onTextSpoken,
    onSpeakingComplete,
    sessionId,
    voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    modelId = 'eleven_flash_v2_5', // Use flash model for lower latency
  } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState(''); // Keep for API compatibility but won't use
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);

  // Refs
  const wsManagerRef = useRef<ElevenLabsWebSocketManager | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const textBufferRef = useRef<TextBuffer | null>(null);
  const isActiveRef = useRef<boolean>(false);
  const stateRef = useRef<VoiceState>('idle');
  
  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef<boolean>(false);
  const recordingStartTimeRef = useRef<number>(0);
  
  // VAD refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameIdRef = useRef<number | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const speechConfirmedTimeRef = useRef<number | null>(null); // When speech was confirmed (for duration check)
  
  // TTS timing refs
  const openaiAbortControllerRef = useRef<AbortController | null>(null);
  const isBargingInRef = useRef<boolean>(false);
  const ttsFirstChunkTimeRef = useRef<number | null>(null);
  const fullTextSentToTTSRef = useRef<string>('');
  const hasStartedSpeakingRef = useRef<boolean>(false);
  
  // Function refs to break circular dependencies
  const stopRecordingAndTranscribeRef = useRef<(() => Promise<void>) | null>(null);
  const startVADRef = useRef<(() => void) | null>(null);

  const log = useCallback((message: string, ...args: any[]) => {
    const context = voiceLogger.getContext();
    console.log(`[Voice] ${message}`, ...args);
    voiceLogger.log('Conversation', message, { ...context, legacy: true });
  }, []);

  // Transition state with logging
  const transitionState = useCallback((newState: VoiceState, reason: string) => {
    const prevState = stateRef.current;
    if (prevState === newState) return;
    
    console.log(`[Voice] State: ${prevState} → ${newState} (${reason})`);
    stateRef.current = newState;
    setState(newState);
    voiceLogger.stateTransition(prevState, newState, reason, voiceLogger.getContext());
  }, []);

  /**
   * Initialize TTS WebSocket
   */
  const initializeTTS = useCallback(async () => {
    if (wsManagerRef.current) {
      return wsManagerRef.current;
    }

    log('Initializing TTS WebSocket');

    const ttsOptions: TTSOptions = {
      voiceId,
      modelId,
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
        speed: 1.0,
      },
    };

    const wsManager = new ElevenLabsWebSocketManager(ttsOptions);

    wsManager.onAudioChunk((chunk) => {
      if (audioPlayerRef.current && isActiveRef.current && !isBargingInRef.current) {
        // Track first audio chunk for latency logging
        if (ttsFirstChunkTimeRef.current !== null) {
          const timeToFirstAudio = Date.now() - ttsFirstChunkTimeRef.current;
          voiceLogger.timing('TTS time-to-first-audio', timeToFirstAudio, voiceLogger.getContext());
          ttsFirstChunkTimeRef.current = null;
        }
        
        // Transition to speaking on first audio
        if (stateRef.current === 'thinking') {
          transitionState('speaking', 'first audio chunk received');
        }
        
        // Update text display synchronized with audio
        if (fullTextSentToTTSRef.current.length > 0) {
          if (!hasStartedSpeakingRef.current) {
            hasStartedSpeakingRef.current = true;
            console.log('[Voice] Started speaking, syncing text display');
          }
          onTextSpoken?.(fullTextSentToTTSRef.current);
        }
        
        audioPlayerRef.current.queueChunk(chunk.audio);
      }
    });

    wsManager.onError((error) => {
      log('TTS WebSocket error:', error);
      transitionState('error', 'TTS error');
      onError?.(error);
    });

    wsManager.onConnect(() => {
      log('TTS WebSocket connected');
    });

    wsManager.onDisconnect(() => {
      log('TTS WebSocket disconnected');
      // Reconnect if still active
      if (isActiveRef.current && wsManagerRef.current) {
        setTimeout(() => {
          if (isActiveRef.current && wsManagerRef.current) {
            wsManagerRef.current.connect();
          }
        }, 1000);
      }
    });

    wsManagerRef.current = wsManager;

    // Initialize audio player
    if (!audioPlayerRef.current) {
      try {
        audioPlayerRef.current = new AudioPlayer();
        await audioPlayerRef.current.initialize();
        
        audioPlayerRef.current.onEnded(() => {
          if (isActiveRef.current && stateRef.current === 'speaking') {
            log('Audio playback ended - returning to listening');
            
            // CRITICAL: Call onSpeakingComplete with the final spoken text
            // This allows the chat UI to show the AI response only after voice finishes
            const spokenText = fullTextSentToTTSRef.current;
            if (spokenText && onSpeakingComplete) {
              console.log('[Voice] Speaking complete, final text length:', spokenText.length);
              onSpeakingComplete(spokenText);
            }
            
            // Reset TTS state
            ttsFirstChunkTimeRef.current = null;
            fullTextSentToTTSRef.current = '';
            hasStartedSpeakingRef.current = false;
            
            // Return to listening
            transitionState('listening', 'playback ended');
            
            // Resume recording - use setTimeout to ensure state transition completes first
            setTimeout(() => {
              if (isActiveRef.current && stateRef.current === 'listening' && !isRecordingRef.current) {
                log('Resuming recording after playback ended');
                startRecording();
              }
            }, 100);
          }
        });

        audioPlayerRef.current.onError((error) => {
          log('Audio player error:', error);
          onError?.(error);
        });
      } catch (error: any) {
        log('Failed to initialize audio player:', error);
        throw new Error(`Audio player init failed: ${error.message}`);
      }
    }

    // Initialize text buffer with optimized thresholds for faster speech
    // Lower thresholds = faster TTS start = lower perceived latency
    if (!textBufferRef.current) {
      textBufferRef.current = new TextBuffer({
        minChars: 20,  // Reduced from 25 for faster start
        maxChars: 40,  // Reduced from 50 for more frequent flushes
        sentenceBoundaries: true,
      });

      textBufferRef.current.onFlush((text) => {
        if (wsManagerRef.current && isActiveRef.current && !isBargingInRef.current) {
          // Accumulate text for synchronized display
          fullTextSentToTTSRef.current += text;
          console.log('[Voice] Flushing to TTS:', text.length, 'chars');
          
          // Don't update display here - wait for audio chunks to sync text with actual playback
          // Text will be shown when audio chunks are received (in onAudioChunk callback)
          
          wsManagerRef.current.sendText(text, false);
        }
      });
    }

    await wsManager.connect();
    return wsManager;
  }, [voiceId, modelId, onError, onTextSpoken, log, transitionState]);

  /**
   * Start microphone and VAD
   */
  const startMicrophone = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current && streamRef.current.active) {
      return streamRef.current;
    }

    log('Starting microphone');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimal for speech
        },
      });
      streamRef.current = stream;
      
      // Initialize audio context for VAD
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      sourceNode.connect(analyserRef.current);
      
      log('Microphone and VAD initialized');
      return stream;
    } catch (error: any) {
      log('Microphone error:', error);
      let errorMessage = 'Failed to access microphone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow access in browser settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found.';
      }
      throw new Error(errorMessage);
    }
  }, [log]);

  /**
   * Stop microphone
   */
  const stopMicrophone = useCallback(() => {
    log('Stopping microphone');
    
    // Stop VAD
    if (vadFrameIdRef.current) {
      cancelAnimationFrame(vadFrameIdRef.current);
      vadFrameIdRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [log]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(() => {
    if (isRecordingRef.current || !streamRef.current) return;

    log('Starting recording');
    isRecordingRef.current = true;
    recordingChunksRef.current = [];
    recordingStartTimeRef.current = Date.now();
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    silenceStartTimeRef.current = null;
    speechConfirmedTimeRef.current = null;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        log('Recording error:', event);
        isRecordingRef.current = false;
        onError?.(new Error('Recording error'));
      };

      mediaRecorder.start(50); // Collect chunks every 50ms for faster processing
      mediaRecorderRef.current = mediaRecorder;
      
      // Start VAD monitoring - use ref to avoid circular dependency
      if (startVADRef.current) {
        startVADRef.current();
      }
      
    } catch (error: any) {
      log('Failed to start recording:', error);
      isRecordingRef.current = false;
      onError?.(new Error(`Recording failed: ${error.message}`));
    }
  }, [log, onError]);

  /**
   * VAD: Monitor audio energy to detect speech
   * Uses adaptive noise floor to handle varying environments
   */
  const startVAD = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) {
      console.error('[VAD] Cannot start - no analyser or audioContext');
      return;
    }
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = audioContextRef.current.sampleRate;
    
    // Speech frequency range (300Hz - 3400Hz)
    const speechLowBin = Math.floor(300 * analyser.fftSize / sampleRate);
    const speechHighBin = Math.floor(3400 * analyser.fftSize / sampleRate);
    
    let frameCount = 0;
    let lastLogTime = 0;
    
    // Adaptive noise floor - starts high and adapts to environment
    let noiseFloor = 0.05; // Initial noise floor estimate
    const noiseFloorAlpha = 0.02; // How fast to adapt (slower = more stable)

    console.log('[VAD] Started monitoring', { 
      speechLowBin, 
      speechHighBin, 
      sampleRate,
      threshold: VAD_CONFIG.energyThreshold 
    });

    const checkEnergy = () => {
      // Always continue the loop while recording
      if (!isRecordingRef.current) {
        console.log('[VAD] Stopping - not recording');
        return;
      }
      
      // Skip processing if not in listening state
      if (!isActiveRef.current || stateRef.current !== 'listening') {
        vadFrameIdRef.current = requestAnimationFrame(checkEnergy);
        return;
      }
      
      // Ensure audio context and analyser are valid
      if (!analyser || !audioContextRef.current) {
        console.error('[VAD] Missing analyser or audio context');
        return;
      }
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate energy in speech frequency range only
      let speechEnergy = 0;
      let count = 0;
      for (let i = speechLowBin; i < Math.min(speechHighBin, bufferLength); i++) {
        const normalized = dataArray[i] / 255;
        speechEnergy += normalized * normalized;
        count++;
      }
      const speechRms = count > 0 ? Math.sqrt(speechEnergy / count) : 0;
      
      const now = Date.now();
      frameCount++;
      
      // Adaptive threshold: noise floor + fixed threshold above it
      // Only update noise floor during silence (when not speaking)
      if (!isSpeakingRef.current) {
        // Slowly adapt noise floor to current environment
        noiseFloor = noiseFloor * (1 - noiseFloorAlpha) + speechRms * noiseFloorAlpha;
      }
      
      // Speech is detected if energy is significantly above noise floor
      // More adaptive: use noise floor multiplier OR fixed minimum, whichever is lower
      // This allows thresholds as low as 0.03 (0.06 * 0.5) in very quiet environments
      // while maintaining a reasonable floor for noise rejection
      const baseThreshold = noiseFloor * VAD_CONFIG.noiseMultiplier;
      const dynamicThreshold = Math.max(baseThreshold, VAD_CONFIG.energyThreshold * 0.5);
      
      // HYSTERESIS: Use different thresholds for starting vs ending speech
      // To START speech: energy must be ABOVE dynamicThreshold
      // To END speech (silence): energy must be BELOW 60% of dynamicThreshold (significant drop)
      const speechStartThreshold = dynamicThreshold;
      const silenceThreshold = dynamicThreshold * 0.6;
      
      const hasSpeechStart = speechRms > speechStartThreshold;
      const hasSilence = speechRms < silenceThreshold;
      
      // Optimized logging: Only log key events to reduce console overhead
      // This improves latency by reducing synchronous console.log calls
      // Log only on state changes or periodically (every 3 seconds) when debug is off
      const shouldLog = VAD_CONFIG.debugLogging 
        ? (now - lastLogTime > 1000) // Debug: every 1s instead of 500ms
        : (now - lastLogTime > 3000); // Production: every 3s instead of 2s
      
      if (shouldLog) {
        // Only log if there's a significant change or it's been long enough
        // This reduces console overhead which can block the main thread
        console.log(`[VAD] Energy: ${speechRms.toFixed(4)}, noise=${noiseFloor.toFixed(4)}, thresh=${dynamicThreshold.toFixed(4)}, speaking=${isSpeakingRef.current}`);
        lastLogTime = now;
      }

      if (!isSpeakingRef.current) {
        // Not currently speaking - check if speech starts
        if (hasSpeechStart) {
          if (speechStartTimeRef.current === null) {
            speechStartTimeRef.current = now;
            if (VAD_CONFIG.debugLogging) {
              console.log('[VAD] Potential speech start detected');
            }
          } else if (now - speechStartTimeRef.current >= VAD_CONFIG.speechStartMs) {
            // Confirmed speech start
            isSpeakingRef.current = true;
            speechConfirmedTimeRef.current = now; // Track when speech was confirmed
            speechStartTimeRef.current = null;
            silenceStartTimeRef.current = null; // Reset silence timer
            console.log('[VAD] ✓ Speech CONFIRMED - user is speaking');
          }
        } else {
          // Not enough energy to start speech - reset potential start
          speechStartTimeRef.current = null;
        }
      } else {
        // Currently speaking - check if silence (with hysteresis)
        if (hasSilence) {
          // Energy dropped significantly below threshold - count as silence
          if (silenceStartTimeRef.current === null) {
            silenceStartTimeRef.current = now;
            console.log('[VAD] Silence detected (energy dropped) - waiting for end...');
          } else {
            const silenceDuration = now - silenceStartTimeRef.current;
            
            // Log silence progress every 300ms
            if (VAD_CONFIG.debugLogging && Math.floor(silenceDuration / 300) !== Math.floor((silenceDuration - 16) / 300)) {
              console.log(`[VAD] Silence: ${silenceDuration}ms / ${VAD_CONFIG.silenceEndMs}ms`);
            }
            
            if (silenceDuration >= VAD_CONFIG.silenceEndMs) {
              // Silence long enough - check if speech was long enough to process
              const speechDuration = speechConfirmedTimeRef.current 
                ? (silenceStartTimeRef.current! - speechConfirmedTimeRef.current) 
                : 0;
              
              if (speechDuration < VAD_CONFIG.minSpeechDurationMs) {
                // Speech was too short - likely noise, ignore it
                console.log(`[VAD] ✗ Speech too short (${speechDuration}ms < ${VAD_CONFIG.minSpeechDurationMs}ms) - ignoring (likely noise)`);
                isSpeakingRef.current = false;
                silenceStartTimeRef.current = null;
                speechConfirmedTimeRef.current = null;
                // Continue listening, don't process
              } else {
                // Valid speech detected - process recording
                console.log(`[VAD] ✓ Speech ENDED (${speechDuration}ms) - processing audio now`);
                isSpeakingRef.current = false;
                silenceStartTimeRef.current = null;
                speechConfirmedTimeRef.current = null;
                
                // Stop recording and transcribe
                if (stopRecordingAndTranscribeRef.current) {
                  stopRecordingAndTranscribeRef.current();
                }
                return; // Don't continue VAD loop
              }
            }
          }
        } else if (hasSpeechStart) {
          // Clear energy is above threshold - definitely speaking, reset silence timer
          silenceStartTimeRef.current = null;
        }
        // Note: If energy is in the "gray zone" (between silenceThreshold and speechStartThreshold),
        // we don't reset the silence timer - this prevents flickering
      }

      vadFrameIdRef.current = requestAnimationFrame(checkEnergy);
    };

    vadFrameIdRef.current = requestAnimationFrame(checkEnergy);
  }, []);

  /**
   * Stop recording and transcribe with ElevenLabs STT
   */
  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) {
      return;
    }

    log('Stopping recording for transcription');
    isRecordingRef.current = false;
    
    // Stop VAD
    if (vadFrameIdRef.current) {
      cancelAnimationFrame(vadFrameIdRef.current);
      vadFrameIdRef.current = null;
    }

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        try {
          const recordingDuration = Date.now() - recordingStartTimeRef.current;
          
          // Check minimum duration
          if (recordingDuration < VAD_CONFIG.minRecordingMs) {
            log('Recording too short, resuming listening');
            if (isActiveRef.current) {
              startRecording();
            }
            resolve();
            return;
          }

          const audioBlob = new Blob(recordingChunksRef.current, {
            type: mediaRecorder.mimeType || 'audio/webm',
          });

          if (audioBlob.size < 1000) {
            log('Audio too small, resuming listening');
            if (isActiveRef.current) {
              startRecording();
            }
            resolve();
            return;
          }

          log(`Recording: ${audioBlob.size} bytes, ${recordingDuration}ms`);

          // Transition to thinking state
          transitionState('thinking', 'transcribing audio');
          setIsTranscribing(true);

          // Send to OpenAI Whisper STT (more reliable than ElevenLabs STT)
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          console.log('[Voice] Sending audio for transcription:', audioBlob.size, 'bytes');

          const response = await fetch('/api/stt/whisper', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('[Voice] Transcription failed:', errorData);
            setIsTranscribing(false);
            throw new Error(`Transcription failed: ${errorData.error || response.statusText}`);
          }

          const data = await response.json();
          const transcribedText = data.text?.trim();
          setIsTranscribing(false);

          if (!transcribedText) {
            log('Empty transcription, resuming listening');
            transitionState('listening', 'empty transcription');
            if (isActiveRef.current) {
              startRecording();
            }
            resolve();
            return;
          }

          log(`Transcription: "${transcribedText}"`);
          setTranscript(transcribedText);

          // Send to parent (will trigger LLM response)
          onTranscriptComplete?.(transcribedText);
          
          resolve();
        } catch (error: any) {
          log('Transcription error:', error);
          setIsTranscribing(false);
          transitionState('listening', 'transcription error');
          onError?.(error);
          if (isActiveRef.current) {
            startRecording();
          }
          resolve();
        }
      };

      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        mediaRecorder.onstop?.(new Event('stop'));
      }
    });
  }, [log, onTranscriptComplete, onError, transitionState, startRecording]);

  // Update refs when functions change (to break circular dependencies)
  useEffect(() => {
    stopRecordingAndTranscribeRef.current = stopRecordingAndTranscribe;
  }, [stopRecordingAndTranscribe]);
  
  useEffect(() => {
    startVADRef.current = startVAD;
  }, [startVAD]);

  /**
   * Handle barge-in (user interrupts AI speaking)
   */
  const handleBargeIn = useCallback(() => {
    log('Barge-in detected');
    isBargingInRef.current = true;

    // CRITICAL: Save what was spoken before interruption
    // This adds the partial response to chat (what user actually heard)
    const spokenText = fullTextSentToTTSRef.current;
    if (spokenText && onSpeakingComplete) {
      console.log('[Voice] Barge-in: saving spoken text:', spokenText.length, 'chars');
      onSpeakingComplete(spokenText);
    }

    // Stop TTS WebSocket
    if (wsManagerRef.current?.getConnectionStatus()) {
      wsManagerRef.current.closeCurrentContext();
    }

    // Stop audio playback immediately
    audioPlayerRef.current?.stop();

    // Clear pending text buffer
    textBufferRef.current?.clear();

    // Abort OpenAI stream
    if (openaiAbortControllerRef.current && !openaiAbortControllerRef.current.signal.aborted) {
      openaiAbortControllerRef.current.abort();
      openaiAbortControllerRef.current = null;
    }

    // Reset TTS state
    ttsFirstChunkTimeRef.current = null;
    fullTextSentToTTSRef.current = '';
    hasStartedSpeakingRef.current = false;

    // Transition to listening
    transitionState('listening', 'barge-in');

    setTimeout(() => {
      isBargingInRef.current = false;
    }, 100);

    onBargeIn?.();
    
    // Resume recording
    if (isActiveRef.current) {
      startRecording();
    }
  }, [log, onBargeIn, onSpeakingComplete, transitionState, startRecording]);

  /**
   * Prepare TTS context (called when LLM starts streaming)
   * CRITICAL: Only creates one context per response to prevent duplicate audio
   * This function is idempotent - safe to call multiple times, only creates context once
   */
  const prepareTTS = useCallback(() => {
    if (!isActiveRef.current || !wsManagerRef.current) return;

    // Only prepare once per response (when ttsFirstChunkTimeRef is null)
    // This prevents multiple context creation which causes duplicate audio
    if (ttsFirstChunkTimeRef.current === null) {
      ttsFirstChunkTimeRef.current = Date.now();
      log('Preparing TTS context');
      
      // Close any existing context to ensure clean state
      if (wsManagerRef.current.getConnectionStatus()) {
        wsManagerRef.current.closeCurrentContext();
      }
      
      // Create new context - only one per response
      wsManagerRef.current.createContext();
    }
    // If already prepared, do nothing (prevents duplicate contexts)
  }, [log]);

  /**
   * Stream text to TTS
   */
  const streamToTTS = useCallback((text: string) => {
    if (isBargingInRef.current || !isActiveRef.current || !textBufferRef.current || !wsManagerRef.current) {
      return;
    }

    // Ensure TTS is prepared
    if (ttsFirstChunkTimeRef.current === null) {
      prepareTTS();
    }

    // Transition to thinking if not already
    if (stateRef.current === 'listening') {
      transitionState('thinking', 'TTS content received');
    }

    // Add to buffer (will auto-flush when ready)
    textBufferRef.current.add(text);
  }, [prepareTTS, transitionState]);

  /**
   * Flush remaining TTS buffer and send final chunk
   * The onFlush callback sends with flush=false, but for the final chunk we need flush=true
   */
  const flushTTS = useCallback(() => {
    if (textBufferRef.current && wsManagerRef.current?.getConnectionStatus()) {
      // Get remaining text without triggering callback (to avoid double-add)
      const remaining = textBufferRef.current.getBuffer();
      if (remaining) {
        // Clear the buffer
        textBufferRef.current.clear();
        // Add to accumulated text
        fullTextSentToTTSRef.current += remaining;
        // Don't call onTextSpoken here - wait for audio chunks to sync text with actual playback
        // Text will be shown when audio chunks are received (in onAudioChunk callback)
        // Send with flush=true to indicate end of text
        wsManagerRef.current.sendText(remaining, true);
        console.log('[Voice] Final TTS flush:', remaining.length, 'chars');
      } else {
        // No remaining text, but still send empty flush to finalize TTS
        wsManagerRef.current.sendText('', true);
      }
    }
  }, [onTextSpoken]);

  /**
   * Start voice conversation
   */
  const startConversation = useCallback(async () => {
    if (isActiveRef.current) {
      log('Already active');
      return;
    }

    log('Starting conversation');
    
    // CRITICAL: Reset WebSocket state before starting
    // This ensures clean reconnection if previous connection had issues
    if (wsManagerRef.current) {
      try {
        log('Resetting previous WebSocket connection');
        wsManagerRef.current.closeCurrentContext();
        wsManagerRef.current = null;
      } catch (e) {
        // Ignore errors when closing - connection might already be closed
        log('Error closing previous WebSocket (ignored):', e);
      }
    }
    
    isActiveRef.current = true;
    setIsActive(true);

    try {
      // Initialize TTS (will create new WebSocket connection)
      await initializeTTS();

      // Start microphone
      await startMicrophone();

      // Reset state
      setTranscript('');
      setLiveTranscript('');
      isSpeakingRef.current = false;
      speechStartTimeRef.current = null;
      silenceStartTimeRef.current = null;
      speechConfirmedTimeRef.current = null;

      // Transition to listening
      transitionState('listening', 'conversation started');

      // Start recording
      startRecording();

      log('Conversation started');
    } catch (error: any) {
      log('Failed to start:', error);
      isActiveRef.current = false;
      setIsActive(false);
      transitionState('error', error.message);
      onError?.(error);
      throw error;
    }
  }, [initializeTTS, startMicrophone, startRecording, transitionState, onError, log]);

  /**
   * End voice conversation
   */
  const endConversation = useCallback(() => {
    log('Ending conversation');
    
    isActiveRef.current = false;
    setIsActive(false);
    isBargingInRef.current = false;

    // Stop recording
    if (mediaRecorderRef.current && isRecordingRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
      isRecordingRef.current = false;
    }

    // Stop VAD
    if (vadFrameIdRef.current) {
      cancelAnimationFrame(vadFrameIdRef.current);
      vadFrameIdRef.current = null;
    }

    // Stop microphone
    stopMicrophone();

    // Disconnect TTS
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
      wsManagerRef.current = null;
    }

    // Stop audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      audioPlayerRef.current.cleanup();
      audioPlayerRef.current = null;
    }

    // Clear buffer
    if (textBufferRef.current) {
      textBufferRef.current.clear();
      textBufferRef.current = null;
    }

    // Abort OpenAI
    if (openaiAbortControllerRef.current) {
      openaiAbortControllerRef.current.abort();
      openaiAbortControllerRef.current = null;
    }

    // Reset state
    transitionState('idle', 'conversation ended');
    setTranscript('');
    setLiveTranscript('');
    ttsFirstChunkTimeRef.current = null;
    fullTextSentToTTSRef.current = '';
    hasStartedSpeakingRef.current = false;

    log('Conversation ended');
  }, [stopMicrophone, transitionState, log]);

  /**
   * Pause conversation
   */
  const pauseConversation = useCallback(() => {
    if (!isActiveRef.current) return;

    log('Pausing');

    // Stop recording
    if (mediaRecorderRef.current && isRecordingRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
      isRecordingRef.current = false;
    }

    // Stop VAD
    if (vadFrameIdRef.current) {
      cancelAnimationFrame(vadFrameIdRef.current);
      vadFrameIdRef.current = null;
    }

    // Pause audio
    audioPlayerRef.current?.pause();

    // Stop microphone
    stopMicrophone();

    transitionState('idle', 'paused');
  }, [stopMicrophone, transitionState, log]);

  /**
   * Resume conversation
   */
  const resumeConversation = useCallback(async () => {
    if (!isActiveRef.current) {
      await startConversation();
      return;
    }

    log('Resuming');

    try {
      // Resume audio if paused
      if (audioPlayerRef.current?.getIsPaused()) {
        await audioPlayerRef.current.resume();
        if (audioPlayerRef.current.getIsPlaying()) {
          transitionState('speaking', 'resumed playback');
          await startMicrophone();
          return;
        }
      }

      // Restart microphone and recording
      await startMicrophone();
      transitionState('listening', 'resumed');
      startRecording();
    } catch (error: any) {
      log('Resume failed:', error);
      onError?.(error);
    }
  }, [startConversation, startMicrophone, startRecording, transitionState, onError, log]);

  /**
   * Set OpenAI abort controller (for barge-in)
   */
  const setOpenAIAbortController = useCallback((controller: AbortController | null) => {
    openaiAbortControllerRef.current = controller;
  }, []);

  // These are kept for API compatibility but do nothing in new implementation
  const detectSpeechStart = useCallback(() => {
    // VAD handles this internally now
    if (stateRef.current === 'speaking' && isActiveRef.current) {
      handleBargeIn();
    }
  }, [handleBargeIn]);

  const detectSpeechEnd = useCallback(async () => {
    // VAD handles this internally now
  }, []);

  const handlePauseDuringSpeech = useCallback(async () => {
    // Not used in new implementation - we wait for complete utterance
  }, []);

  const getStreamRef = useCallback((): MediaStream | null => {
    return streamRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isActiveRef.current) {
        endConversation();
      }
    };
  }, [endConversation]);

  return {
    state,
    isActive,
    transcript,
    liveTranscript, // Always empty now - no live transcription
    isTranscribing,
    startConversation,
    endConversation,
    pauseConversation,
    resumeConversation,
    streamToTTS,
    flushTTS,
    prepareTTS,
    handleBargeIn,
    setOpenAIAbortController,
    detectSpeechStart,
    detectSpeechEnd,
    handlePauseDuringSpeech,
    getStreamRef,
  };
}
