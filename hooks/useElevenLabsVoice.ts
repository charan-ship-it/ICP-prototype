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
  // VAD Configuration - Tuned for noise rejection and snappy silence detection
  energyThreshold: 0.1,         // Higher limit (0.1) to reject substantial background noise
  speechStartMs: 150,             // 150ms confirmation to ensure it's real speech
  bargeInStartMs: 200,           // 200ms for barge-in (harder to interrupt by accident)
  silenceEndMs: 600,             // 600ms silence = end of turn (balanced)
  minRecordingMs: 500,           // 500ms min recording to ignore clicks/pops
  minSpeechDurationMs: 400,      // 400ms min actual speech
  maxRecordingMs: 30000,         // 30s max
  noiseMultiplier: 1.5,          // Lower multiplier (1.5) - rely more on absolute thresholds
  bargeInNoiseMultiplier: 3.0,   // High barrier for barge-in
  debugLogging: true,            // Enable logging to help debug

  // Advanced VAD settings
  silenceHardCapMs: 2500,        // 2.5s hard limit on silence
  speechBandRatioThreshold: 0.55, // 55% of energy MUST be in speech band (very selective)
  speechBandRatioMin: 0.30,       // Min ratio to even consider updating noise floor
  noiseFloorEmaAlpha: 0.01,      // Very slow adaptation
  noiseFloorMax: 0.15,           // Allow higher noise floor
  thresholdMin: 0.08,            // Minimum threshold floor
  thresholdMax: 0.30,            // Max threshold

  // New: Relative drop-off for silence detection
  // If energy drops to X% of the peak energy observed during this utterance, it's silence.
  // This helps in noisy environments where "silence" is still loud, but quieter than the speech.
  silenceRelativeDropFromPeak: 0.4,
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
  const [liveTranscript, setLiveTranscript] = useState(''); // Live transcription from Whisper chunks
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [vadStats, setVadStats] = useState<{ energy: number; threshold: number; isSpeaking: boolean }>({ energy: 0, threshold: 0, isSpeaking: false });
  const lastStatUpdateTimeRef = useRef<number>(0);

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

  // New VAD refs
  const currentPeakEnergyRef = useRef<number>(0); // Track peak energy during current utterance

  // TTS timing refs
  const openaiAbortControllerRef = useRef<AbortController | null>(null);
  const isBargingInRef = useRef<boolean>(false);
  const ttsFirstChunkTimeRef = useRef<number | null>(null);
  const fullTextSentToTTSRef = useRef<string>('');
  const hasStartedSpeakingRef = useRef<boolean>(false);
  const handleBargeInRef = useRef<(() => void) | null>(null);

  // Assistant turn management (ChatGPT-like)
  const currentAssistantTurnRef = useRef<{
    turnId: number;
    messageId: string | null;
    abortController: AbortController | null;
  }>({
    turnId: 0,
    messageId: null,
    abortController: null,
  });

  // Recording session ID to ignore late MediaRecorder chunks
  const recordingSessionIdRef = useRef<number>(0);

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

          // CRITICAL: Stop recording when AI starts speaking to prevent echo/feedback
          // Barge-in is disabled, so we don't need to listen during AI speech
          if (isRecordingRef.current && mediaRecorderRef.current) {
            log('Stopping recording - AI is speaking (barge-in disabled)');
            try {
              mediaRecorderRef.current.stop();
            } catch (e) {
              // Ignore errors when stopping
            }
            isRecordingRef.current = false;
          }

          // Stop VAD to prevent listening to AI's own voice
          if (vadFrameIdRef.current) {
            cancelAnimationFrame(vadFrameIdRef.current);
            vadFrameIdRef.current = null;
            log('Stopped VAD - AI is speaking');
          }
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

            // CRITICAL FIX: Resume recording AFTER assistant finishes speaking
            // This ensures sequential flow: listen → transcribe → stream LLM → TTS speak → then resume listening
            setTimeout(() => {
              if (isActiveRef.current && stateRef.current === 'listening' && !isRecordingRef.current) {
                log('Resuming recording after assistant finished speaking');
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

          // CRITICAL FIX: Update display immediately when text is flushed to TTS
          // This ensures text is shown even if audio chunks are delayed
          // Audio chunks will still sync the display, but this provides immediate feedback
          if (fullTextSentToTTSRef.current.length > 0) {
            onTextSpoken?.(fullTextSentToTTSRef.current);
          }

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

    // Increment session ID for new recording
    recordingSessionIdRef.current += 1;
    const currentSessionId = recordingSessionIdRef.current;

    log('Starting recording');
    isRecordingRef.current = true;
    recordingChunksRef.current = [];
    recordingStartTimeRef.current = Date.now();
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    silenceStartTimeRef.current = null;
    speechConfirmedTimeRef.current = null;
    currentPeakEnergyRef.current = 0; // Reset peak energy

    // Set maximum recording timeout to prevent infinite loops
    const maxRecordingTimeout = setTimeout(() => {
      if (isRecordingRef.current && isActiveRef.current) {
        console.log('[VAD] Maximum recording duration reached - forcing stop');
        if (stopRecordingAndTranscribeRef.current) {
          stopRecordingAndTranscribeRef.current();
        }
      }
    }, VAD_CONFIG.maxRecordingMs);

    // Store timeout ref for cleanup
    (recordingStartTimeRef as any).maxTimeout = maxRecordingTimeout;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // CRITICAL: Only accept chunks from current session
          if (recordingSessionIdRef.current === currentSessionId) {
            recordingChunksRef.current.push(event.data);
          } else {
            // Late chunk from old session - ignore
            console.log('[Recording] Ignoring late chunk from old session');
          }
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

    // Speech frequency range (300Hz - 3400Hz) - bins 12-145 for typical 48kHz sample rate
    const speechLowBin = Math.floor(300 * analyser.fftSize / sampleRate);
    const speechHighBin = Math.floor(3400 * analyser.fftSize / sampleRate);

    let frameCount = 0;
    let lastLogTime = 0;

    // Adaptive noise floor - starts high and adapts to environment
    // Use EMA (Exponential Moving Average) for smooth adaptation
    let noiseFloor = 0.05; // Initial noise floor estimate

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

      // Run VAD ONLY during listening state (barge-in disabled)
      // Do NOT run VAD during speaking to prevent listening to AI's own voice
      const isListeningState = stateRef.current === 'listening';

      if (!isActiveRef.current || !isListeningState) {
        vadFrameIdRef.current = requestAnimationFrame(checkEnergy);
        return;
      }

      // Ensure audio context and analyser are valid
      if (!analyser || !audioContextRef.current) {
        console.error('[VAD] Missing analyser or audio context');
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Calculate total energy across all frequencies
      let totalEnergy = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = dataArray[i] / 255;
        totalEnergy += normalized * normalized;
      }
      const totalRms = bufferLength > 0 ? Math.sqrt(totalEnergy / bufferLength) : 0;

      // Calculate energy in speech frequency range only
      let speechBandEnergy = 0;
      let speechBandCount = 0;
      for (let i = speechLowBin; i < Math.min(speechHighBin, bufferLength); i++) {
        const normalized = dataArray[i] / 255;
        speechBandEnergy += normalized * normalized;
        speechBandCount++;
      }
      const speechBandRms = speechBandCount > 0 ? Math.sqrt(speechBandEnergy / speechBandCount) : 0;

      // Calculate speech-band ratio to reject low-frequency noise
      const speechBandRatio = totalRms > 0 ? speechBandRms / totalRms : 0;

      const now = Date.now();
      frameCount++;

      // CRITICAL FIX: Smooth noise floor with EMA (Exponential Moving Average)
      // Only update noise floor during silence (when not speaking)
      // VAD only runs during listening state now, so we can always update noise floor
      if (!isSpeakingRef.current) {
        // EMA: noise = noise * (1 - alpha) + energy * alpha
        noiseFloor = noiseFloor * (1 - VAD_CONFIG.noiseFloorEmaAlpha) + speechBandRms * VAD_CONFIG.noiseFloorEmaAlpha;

        // CRITICAL FIX: Clamp noise floor to prevent it from adapting too high in noisy environments
        // This ensures speech can still be detected even with high background noise
        noiseFloor = Math.min(noiseFloor, VAD_CONFIG.noiseFloorMax);
      }

      // Use standard noise multiplier (barge-in disabled, so no special handling needed)
      const noiseMultiplier = VAD_CONFIG.noiseMultiplier;

      // Speech is detected if energy is significantly above noise floor
      // More selective: use noise floor multiplier with higher baseline
      // This ensures we only detect clear speech, not background noise
      // Higher thresholds = more selective = less false triggers
      const baseThreshold = noiseFloor * noiseMultiplier;
      let dynamicThreshold = Math.max(baseThreshold, VAD_CONFIG.energyThreshold * 0.8);

      // CRITICAL FIX: Clamp threshold to prevent wild swings due to noise
      dynamicThreshold = Math.max(VAD_CONFIG.thresholdMin, Math.min(VAD_CONFIG.thresholdMax, dynamicThreshold));

      // UPDATED HYSTERESIS:
      // Start Threshold uses the dynamic threshold
      // Silence Threshold uses EITHER 60% of dynamic threshold OR the relative drop logic
      const speechStartThreshold = dynamicThreshold;
      const silenceThreshold = dynamicThreshold * 0.6;

      // Track peak energy during speech for relative drop-off detection
      if (isSpeakingRef.current) {
        if (speechBandRms > currentPeakEnergyRef.current) {
          currentPeakEnergyRef.current = speechBandRms;
        }
      }

      // CRITICAL FIX: Use speech-band ratio to reject low-frequency noise
      // More selective: require higher ratio in noisy environments to reject background noise
      // Only clear speech has high speech-band ratio (300-3400Hz energy vs total energy)
      const adaptiveRatioThreshold = noiseFloor > 0.05
        ? Math.max(VAD_CONFIG.speechBandRatioThreshold, VAD_CONFIG.speechBandRatioThreshold * 1.2) // Higher threshold in noisy environments
        : VAD_CONFIG.speechBandRatioThreshold; // Normal threshold in quiet environments

      // Only treat as speech if speech-band ratio is high enough AND energy is above threshold
      const hasSpeechStart = speechBandRms > speechStartThreshold &&
        speechBandRatio > adaptiveRatioThreshold;

      // IMPROVED SILENCE DETECTION: 
      // 1. Energy below absolute silence threshold
      // 2. Ratio below threshold (it's no longer "speech-like")
      // 3. Energy drops to significant % below peak (relative drop-off)
      const relativeSilenceThreshold = currentPeakEnergyRef.current * VAD_CONFIG.silenceRelativeDropFromPeak;
      const hasRelativeDropSilence = isSpeakingRef.current && speechBandRms < relativeSilenceThreshold;

      const hasSilence = speechBandRms < silenceThreshold ||
        speechBandRatio <= adaptiveRatioThreshold ||
        (isSpeakingRef.current && hasRelativeDropSilence);

      // Debug logging only when enabled (disabled by default to reduce console clutter)
      if (VAD_CONFIG.debugLogging && (now - lastLogTime > 2000)) { // Every 2 seconds if enabled
        const silenceMs = silenceStartTimeRef.current ? (now - silenceStartTimeRef.current) : 0;
        console.log(`[VAD] Energy: ${speechBandRms.toFixed(4)}, Peak: ${currentPeakEnergyRef.current.toFixed(4)}, Thresh: ${dynamicThreshold.toFixed(4)}, RelThresh: ${relativeSilenceThreshold.toFixed(4)}, Speaking: ${isSpeakingRef.current}`);
        lastLogTime = now;
      }

      // Update debug stats (throttled to 10Hz)
      if (now - lastStatUpdateTimeRef.current > 100) {
        setVadStats({
          energy: speechBandRms,
          threshold: dynamicThreshold,
          isSpeaking: isSpeakingRef.current
        });
        lastStatUpdateTimeRef.current = now;
      }

      if (!isSpeakingRef.current) {
        // Not currently speaking - check if speech starts (normal listening mode)
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
            currentPeakEnergyRef.current = speechBandRms; // Initialize peak energy

            console.log('[VAD] ✓ Speech CONFIRMED - user is speaking');
          }
        } else {
          // Not enough energy to start speech - reset potential start
          speechStartTimeRef.current = null;
        }
      } else {
        // Currently speaking - check if silence detected

        // Check for silence using our improved conditions
        if (hasSilence) {
          // Silence detected - start or continue timer
          if (silenceStartTimeRef.current === null) {
            silenceStartTimeRef.current = now;
            if (VAD_CONFIG.debugLogging) {
              console.log('[VAD] Silence detected - starting timer', {
                energy: speechBandRms.toFixed(4),
                reason: speechBandRms < silenceThreshold ? 'absolute_low' :
                  speechBandRatio <= adaptiveRatioThreshold ? 'bad_ratio' : 'relative_drop'
              });
            }
          } else {
            const silenceDuration = now - silenceStartTimeRef.current;

            // Hard cap: force end after max silence duration
            // Or normal silence duration
            const isHardCapReached = silenceDuration >= VAD_CONFIG.silenceHardCapMs;
            const isNormalSilenceReached = silenceDuration >= VAD_CONFIG.silenceEndMs;

            if (isHardCapReached || isNormalSilenceReached) {
              const speechDuration = speechConfirmedTimeRef.current
                ? (silenceStartTimeRef.current! - speechConfirmedTimeRef.current)
                : 0;

              if (speechDuration >= VAD_CONFIG.minSpeechDurationMs) {
                if (VAD_CONFIG.debugLogging) {
                  console.log(`[VAD] Speech ENDED (${speechDuration}ms) - ${isHardCapReached ? 'hard cap' : 'normal'}`);
                }
                isSpeakingRef.current = false;
                silenceStartTimeRef.current = null;
                speechConfirmedTimeRef.current = null;

                if (stopRecordingAndTranscribeRef.current) {
                  stopRecordingAndTranscribeRef.current();
                }
                return;
              } else {
                // Too short - reset
                console.log('[VAD] Speech too short, ignoring:', speechDuration, 'ms');
                isSpeakingRef.current = false;
                silenceStartTimeRef.current = null;
                speechConfirmedTimeRef.current = null;
                // Don't call stopRecordingAndTranscribe, just reset state
                // This means we treat the short noise as non-speech
              }
            }
          }
        } else {
          // Energy back up - reset silence timer (user continued speaking)
          if (silenceStartTimeRef.current !== null) {
            console.log('[VAD] Speech resumed, resetting silence timer');
            silenceStartTimeRef.current = null;
          }
          // Update peak energy if higher
          if (speechBandRms > currentPeakEnergyRef.current) {
            currentPeakEnergyRef.current = speechBandRms;
          }
        }
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

    // Clear maximum recording timeout if it exists
    const maxTimeout = (recordingStartTimeRef as any).maxTimeout;
    if (maxTimeout) {
      clearTimeout(maxTimeout);
      (recordingStartTimeRef as any).maxTimeout = null;
    }

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

          // Clear live transcript (ChatGPT doesn't show live transcription)
          setLiveTranscript('');

          // Send to parent immediately (will trigger LLM response)
          // ChatGPT starts LLM immediately after transcription
          onTranscriptComplete?.(transcribedText);

          // CRITICAL: Return to listening state immediately after transcription
          // This allows user to speak again while LLM is processing
          transitionState('listening', 'transcription complete');

          // CRITICAL FIX: DO NOT resume recording immediately after transcription
          // Wait until assistant finishes speaking (barge-in disabled)
          // This prevents max-duration forced recording stops and extra transcripts
          // that create new turns and cancel streams
          // Recording will resume in onSpeakingComplete callback
          console.log('[Voice] Transcription complete - NOT resuming recording yet (waiting for assistant to finish speaking)');

          resolve();
        } catch (error: any) {
          log('Transcription error:', error);
          setIsTranscribing(false);
          transitionState('listening', 'transcription error');
          onError?.(error);
          // CRITICAL FIX: Don't resume recording on error - wait for next turn
          // This prevents creating new turns that cancel streams
          // Recording will resume after assistant finishes speaking
          console.log('[Voice] Transcription error - NOT resuming recording (waiting for next turn)');
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
   * ChatGPT-like: Cancel assistant turn completely, instant stop, save partial response, resume listening
   */
  const handleBargeIn = useCallback(() => {
    log('Barge-in detected - cancelling assistant turn completely');

    // CRITICAL: Cancel assistant turn completely
    const currentTurn = currentAssistantTurnRef.current.turnId;
    currentAssistantTurnRef.current.turnId += 1; // Increment to invalidate old turn

    // Abort assistant stream
    if (currentAssistantTurnRef.current.abortController) {
      currentAssistantTurnRef.current.abortController.abort();
      currentAssistantTurnRef.current.abortController = null;
    }

    // Also abort OpenAI stream (if separate)
    if (openaiAbortControllerRef.current && !openaiAbortControllerRef.current.signal.aborted) {
      openaiAbortControllerRef.current.abort();
      openaiAbortControllerRef.current = null;
    }

    // Stop TTS WebSocket immediately
    if (wsManagerRef.current?.getConnectionStatus()) {
      wsManagerRef.current.closeCurrentContext();
    }

    // Stop audio playback immediately
    audioPlayerRef.current?.stop();

    // Clear pending text buffer
    textBufferRef.current?.clear();

    // Save partial response (what user actually heard)
    const spokenText = fullTextSentToTTSRef.current;
    if (spokenText && onSpeakingComplete) {
      console.log('[Voice] Barge-in: saving spoken text:', spokenText.length, 'chars');
      onSpeakingComplete(spokenText);
    }

    // Reset TTS state
    ttsFirstChunkTimeRef.current = null;
    fullTextSentToTTSRef.current = '';
    hasStartedSpeakingRef.current = false;

    // CRITICAL: Reset VAD state completely
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    silenceStartTimeRef.current = null;
    speechConfirmedTimeRef.current = null;

    // CRITICAL: Stop current recording and start fresh session
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    }

    // Clear all recording chunks
    recordingChunksRef.current = [];

    // Increment recording session ID (to ignore late chunks)
    recordingSessionIdRef.current += 1;

    // Set barge-in lock state (not time-based)
    isBargingInRef.current = true;

    // Transition to listening
    transitionState('listening', 'barge-in');

    // CRITICAL FIX: Start fresh recording after barge-in
    // User interrupted, so they want to speak again
    setTimeout(() => {
      if (isActiveRef.current && stateRef.current === 'listening') {
        log('Starting fresh recording after barge-in');
        startRecording(); // Fresh recording with new session ID
      }
      // Reset barge-in flag after recording starts
      setTimeout(() => {
        isBargingInRef.current = false;
      }, 200);
    }, 100);

    onBargeIn?.();
  }, [log, onBargeIn, onSpeakingComplete, transitionState, startRecording]);

  // Update ref when handleBargeIn changes
  useEffect(() => {
    handleBargeInRef.current = handleBargeIn;
  }, [handleBargeIn]);

  /**
   * Start new assistant turn (ChatGPT-like turn management)
   */
  const startNewAssistantTurn = useCallback((messageId: string) => {
    // Log every call to confirm it's only called once per LLM stream
    console.log('[Turn Management] startNewAssistantTurn called', {
      messageId,
      previousTurnId: currentAssistantTurnRef.current.turnId,
      stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });

    // Cancel previous turn if exists
    if (currentAssistantTurnRef.current.abortController) {
      currentAssistantTurnRef.current.abortController.abort();
    }

    // Increment turn ID
    currentAssistantTurnRef.current.turnId += 1;
    currentAssistantTurnRef.current.messageId = messageId;
    currentAssistantTurnRef.current.abortController = new AbortController();

    log(`Starting new assistant turn: ${currentAssistantTurnRef.current.turnId} for message: ${messageId}`);

    return currentAssistantTurnRef.current.turnId;
  }, [log]);

  /**
   * Check if event belongs to current turn
   */
  const isCurrentTurn = useCallback((turnId: number) => {
    return turnId === currentAssistantTurnRef.current.turnId;
  }, []);

  /**
   * Prepare TTS context (called when LLM starts streaming)
   * CRITICAL: Only creates one context per response to prevent duplicate audio
   * This function is idempotent - safe to call multiple times, only creates context once
   * Now with turnId checks to ignore old turns
   */
  const prepareTTS = useCallback((turnId?: number) => {
    if (!isActiveRef.current || !wsManagerRef.current) return;

    // CRITICAL: Check if this is for current turn
    if (turnId !== undefined && turnId !== currentAssistantTurnRef.current.turnId) {
      console.log('[TTS] Ignoring prepareTTS for old turn:', turnId, 'current:', currentAssistantTurnRef.current.turnId);
      return;
    }

    // Atomic check-and-set
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

    // CRITICAL FIX: Update display immediately with buffered text + new text
    // This ensures text is shown even if audio chunks are delayed
    const bufferedText = textBufferRef.current.getBuffer() || '';
    const previewText = fullTextSentToTTSRef.current + bufferedText + text;
    if (previewText.length > 0) {
      onTextSpoken?.(previewText);
    }

    // Add to buffer (will auto-flush when ready)
    textBufferRef.current.add(text);
  }, [prepareTTS, transitionState, onTextSpoken]);

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
      setLiveTranscript(''); // ChatGPT doesn't show live transcription
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
      } catch (e) { }
      isRecordingRef.current = false;
    }

    // Stop VAD
    if (vadFrameIdRef.current) {
      cancelAnimationFrame(vadFrameIdRef.current);
      vadFrameIdRef.current = null;
    }

    // Stop microphone
    stopMicrophone();

    // CRITICAL FIX: Disconnect TTS WebSocket only on conversation end
    // This ensures the connection persists for the whole conversation session
    if (wsManagerRef.current) {
      console.log('[Voice] Disconnecting TTS WebSocket on conversation end');
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
      } catch (e) { }
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
    // Barge-in disabled - do nothing
    // VAD only runs during listening state now
  }, []);

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


  const pauseMicrophone = useCallback(() => {
    isRecordingRef.current = false;
    transitionState('idle', 'microphone_paused_for_processing');
  }, [transitionState]);

  const resumeMicrophone = useCallback(async () => {
    if (stateRef.current !== 'listening') {
      isRecordingRef.current = true;
      transitionState('listening', 'microphone_resumed');
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        await startRecording();
      }
    }
  }, [transitionState, startRecording]);

  return {
    state,
    isActive,
    transcript,
    liveTranscript,
    isTranscribing,
    vadStats, // Export stats
    startConversation,
    endConversation,
    pauseConversation,
    resumeConversation,
    pauseMicrophone, // New
    resumeMicrophone, // New
    streamToTTS,
    flushTTS,
    prepareTTS,
    handleBargeIn,
    setOpenAIAbortController,
    detectSpeechStart,
    detectSpeechEnd,
    handlePauseDuringSpeech,
    getStreamRef,
    startNewAssistantTurn,
    get currentAssistantTurnId() {
      return currentAssistantTurnRef.current.turnId;
    },
  };
}
