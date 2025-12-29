'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ElevenLabsWebSocketManager, TTSOptions } from '@/lib/elevenLabsWebSocket';
import { TextBuffer } from '@/lib/textBuffer';
import { AudioPlayer } from '@/lib/audioPlayer';
import { LiveTranscription } from '@/lib/liveTranscription';
import { voiceLogger } from '@/lib/voiceLogger';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface UseElevenLabsVoiceOptions {
  onTranscriptComplete?: (text: string) => void;
  onBargeIn?: () => void;
  onError?: (error: Error) => void;
  sessionId: string | null;
  voiceId?: string;
  modelId?: string;
}

export function useElevenLabsVoice(options: UseElevenLabsVoiceOptions) {
  const {
    onTranscriptComplete,
    onBargeIn,
    onError,
    sessionId,
    voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    modelId = 'eleven_multilingual_v2',
  } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isActive, setIsActive] = useState<boolean>(false);

  // Refs
  const wsManagerRef = useRef<ElevenLabsWebSocketManager | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const textBufferRef = useRef<TextBuffer | null>(null);
  const isActiveRef = useRef<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const openaiAbortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<VoiceState>('idle');
  const liveTranscriptionRef = useRef<LiveTranscription | null>(null);
  const isBargingInRef = useRef<boolean>(false);
  const ttsFirstChunkTimeRef = useRef<number | null>(null);
  const accumulatedTranscriptRef = useRef<string>(''); // For accumulating interim results

  const log = useCallback((message: string, ...args: any[]) => {
    const context = voiceLogger.getContext();
    let stage: 'Conversation' | 'TTS' | 'Recording' | 'VAD' | 'Error' = 'Conversation';
    if (message.includes('TTS') || message.includes('WebSocket')) stage = 'TTS';
    else if (message.includes('recording') || message.includes('Recording') || message.includes('microphone')) stage = 'Recording';
    else if (message.includes('Speech') || message.includes('VAD')) stage = 'VAD';
    else if (message.includes('error') || message.includes('Error') || message.includes('Failed')) stage = 'Error';
    
    const metadata: any = {};
    if (args.length > 0 && args.some(arg => arg !== undefined && arg !== null)) {
      metadata.args = args;
    }
    voiceLogger.log(stage, message, { ...context, legacy: true, ...metadata });
  }, []);

  /**
   * Initialize WebSocket TTS manager
   */
  const initializeTTS = useCallback(async () => {
    if (wsManagerRef.current) {
      return wsManagerRef.current;
    }

    log('Initializing Eleven Labs WebSocket TTS');

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
        const context = voiceLogger.getContext();
        if (ttsFirstChunkTimeRef.current !== null) {
          const timeToFirstAudio = Date.now() - ttsFirstChunkTimeRef.current;
          voiceLogger.timing('TTS time-to-first-audio', timeToFirstAudio, context);
          voiceLogger.log('TTS', 'First audio chunk received', context);
          ttsFirstChunkTimeRef.current = null;
        }
        audioPlayerRef.current.queueChunk(chunk.audio);
      }
    });

    wsManager.onError((error) => {
      log('WebSocket error:', error);
      setState('error');
      stateRef.current = 'error';
      onError?.(error);
    });

    wsManager.onConnect(() => {
      const context = voiceLogger.getContext();
      voiceLogger.log('TTS', 'WebSocket connected', context);
      log('WebSocket TTS connected');
    });

    wsManager.onDisconnect(() => {
      const context = voiceLogger.getContext();
      voiceLogger.log('TTS', 'WebSocket disconnected', context);
      log('WebSocket TTS disconnected');
      if (isActiveRef.current) {
        setTimeout(() => {
          if (isActiveRef.current && wsManagerRef.current) {
            wsManagerRef.current.connect();
          }
        }, 1000);
      }
    });

    wsManagerRef.current = wsManager;

    if (!audioPlayerRef.current) {
      try {
        audioPlayerRef.current = new AudioPlayer();
        await audioPlayerRef.current.initialize();
        
        if (audioPlayerRef.current) {
          audioPlayerRef.current.onEnded(() => {
            if (isActiveRef.current && stateRef.current === 'speaking') {
              log('Audio playback ended, returning to listening');
              setState('listening');
              stateRef.current = 'listening';
            }
          });

          audioPlayerRef.current.onError((error) => {
            log('Audio player error:', error);
            onError?.(error);
          });
        }
      } catch (error: any) {
        log('Failed to initialize audio player:', error);
        audioPlayerRef.current = null;
        throw new Error(`Audio player initialization failed: ${error.message}`);
      }
    } else {
      try {
        await audioPlayerRef.current.initialize();
      } catch (error: any) {
        log('Failed to re-initialize audio player:', error);
      }
    }

    if (!textBufferRef.current) {
      textBufferRef.current = new TextBuffer({
        minChars: 50,
        maxChars: 100,
        sentenceBoundaries: true,
      });

      textBufferRef.current.onFlush((text) => {
        if (wsManagerRef.current && isActiveRef.current) {
          log('Flushing text buffer to TTS:', text.substring(0, 50) + '...');
          wsManagerRef.current.sendText(text, false);
        }
      });
    }

    await wsManager.connect();
    return wsManager;
  }, [voiceId, modelId, onError, log]);

  /**
   * Start microphone capture
   */
  const startMic = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current && streamRef.current.active) {
      return streamRef.current;
    }

    log('Starting microphone capture');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      log('Microphone capture started');
      return stream;
    } catch (error: any) {
      log('Microphone capture error:', error);
      throw new Error(`Failed to access microphone: ${error.message}`);
    }
  }, [log]);

  /**
   * Stop microphone capture
   */
  const stopMic = useCallback(() => {
    log('Stopping microphone capture');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [log]);

  /**
   * Initialize Live Transcription using SpeechRecognition API
   */
  const initializeLiveTranscription = useCallback(() => {
    if (liveTranscriptionRef.current) {
      return;
    }

    const context = voiceLogger.getContext();
    voiceLogger.log('LiveTranscription', 'Initializing', context);

    // Check if supported
    if (!LiveTranscription.isSupported()) {
      voiceLogger.log('LiveTranscription', 'SpeechRecognition API not supported', context);
      log('SpeechRecognition API not supported in this browser');
      return;
    }

    try {
      liveTranscriptionRef.current = new LiveTranscription({
        continuous: true,
        interimResults: true,
        language: 'en-US',
        onTranscript: (text, isFinal) => {
          if (isFinal) {
            // Final result - this is when user pauses
            voiceLogger.log('LiveTranscription', `Final transcript: "${text}"`, context);
            log(`Live transcription (final): "${text}"`);
            
            // Accumulate final transcript
            const accumulated = accumulatedTranscriptRef.current.trim();
            accumulatedTranscriptRef.current = accumulated ? `${accumulated} ${text}` : text;
            
            // Update UI with accumulated transcript
            setTranscript(accumulatedTranscriptRef.current);
            setLiveTranscript(''); // Clear interim
          } else {
            // Interim result - show live transcription
            voiceLogger.log('LiveTranscription', `Interim transcript: "${text}"`, context);
            setLiveTranscript(text);
          }
        },
        onError: (error) => {
          voiceLogger.error('LiveTranscription', error, context);
          log('Live transcription error:', error);
        },
      });

      voiceLogger.log('LiveTranscription', 'Initialized successfully', context);
    } catch (error: any) {
      voiceLogger.error('LiveTranscription', error, context);
      log('Failed to initialize live transcription:', error);
    }
  }, [log]);

  /**
   * Start recording (for backup/final transcription via Eleven Labs)
   */
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || !streamRef.current) return;

    const context = voiceLogger.getContext();
    voiceLogger.log('Recording', 'Starting', context);
    log('Starting audio recording');
    isRecordingRef.current = true;
    recordingChunksRef.current = [];

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        log('MediaRecorder error:', event);
        isRecordingRef.current = false;
        onError?.(new Error('Recording error occurred'));
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      voiceLogger.log('Recording', 'Started', context);
      log('Audio recording started');
    } catch (error: any) {
      log('Recording error:', error);
      isRecordingRef.current = false;
      onError?.(new Error(`Failed to start recording: ${error.message}`));
    }
  }, [onError, log]);

  /**
   * Stop recording and optionally transcribe with Eleven Labs (fallback)
   */
  const stopRecordingAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) {
      return null;
    }

    log('Stopping audio recording for fallback transcription');
    isRecordingRef.current = false;

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(recordingChunksRef.current, {
            type: mediaRecorder.mimeType || 'audio/webm',
          });

          if (audioBlob.size === 0) {
            log('No audio recorded');
            resolve(null);
            return;
          }

          log(`Audio recorded: ${audioBlob.size} bytes (fallback transcription)`);

          // Only use Eleven Labs as fallback if browser transcription failed
          // For now, skip this since we're using live transcription
          resolve(null);
        } catch (error: any) {
          log('Transcription error:', error);
          onError?.(error instanceof Error ? error : new Error(String(error)));
          resolve(null);
        }
      };

      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        if (mediaRecorder.onstop) {
          const event = new Event('stop');
          mediaRecorder.onstop(event);
        }
      }
    });
  }, [onError, log]);

  /**
   * Handle barge-in (user interrupts AI speaking)
   */
  const handleBargeIn = useCallback(() => {
    const context = voiceLogger.getContext();
    voiceLogger.log('BargeIn', 'Detected', context);
    
    isBargingInRef.current = true;

    let ttsStopped = false;
    if (wsManagerRef.current) {
      if (wsManagerRef.current.getConnectionStatus()) {
        wsManagerRef.current.closeCurrentContext();
        ttsStopped = true;
        voiceLogger.log('BargeIn', 'TTS WebSocket context closed', context);
      } else {
        voiceLogger.log('BargeIn', 'TTS WebSocket not connected, skipping flush', context);
      }
    }

    let audioStopped = false;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.stop();
      audioStopped = true;
      voiceLogger.log('BargeIn', 'Audio playback stopped', context);
    }

    let bufferCleared = false;
    if (textBufferRef.current) {
      textBufferRef.current.clear();
      bufferCleared = true;
      voiceLogger.log('BargeIn', 'Text buffer cleared', context);
    }

    let openaiAborted = false;
    if (openaiAbortControllerRef.current) {
      if (!openaiAbortControllerRef.current.signal.aborted) {
        openaiAbortControllerRef.current.abort();
        openaiAborted = true;
        voiceLogger.log('BargeIn', 'OpenAI stream aborted', context);
      } else {
        voiceLogger.log('BargeIn', 'OpenAI stream already aborted', context);
      }
      openaiAbortControllerRef.current = null;
    } else {
      voiceLogger.log('BargeIn', 'No OpenAI abort controller found', context);
    }

    voiceLogger.log('BargeIn', 'Summary', {
      ...context,
      ttsStopped,
      audioStopped,
      bufferCleared,
      openaiAborted,
    });

    const previousState = stateRef.current;
    setState('listening');
    stateRef.current = 'listening';
    voiceLogger.stateTransition(previousState, 'listening', 'barge-in', context);

    // Reset accumulated transcript since we're starting fresh
    accumulatedTranscriptRef.current = '';
    setTranscript('');
    setLiveTranscript('');

    setTimeout(() => {
      isBargingInRef.current = false;
    }, 100);

    onBargeIn?.();
  }, [onBargeIn]);

  /**
   * Stream text to TTS (buffered)
   */
  const streamToTTS = useCallback((text: string) => {
    if (isBargingInRef.current) {
      const context = voiceLogger.getContext();
      voiceLogger.log('TTS', 'Ignoring chunk during barge-in', context);
      return;
    }

    if (!isActiveRef.current || !textBufferRef.current || !wsManagerRef.current) {
      return;
    }

    if (ttsFirstChunkTimeRef.current === null && stateRef.current !== 'speaking') {
      ttsFirstChunkTimeRef.current = Date.now();
      const context = voiceLogger.getContext();
      voiceLogger.log('TTS', 'Starting', context);
    }

    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') {
      const previousState = stateRef.current;
      setState('speaking');
      stateRef.current = 'speaking';
      const context = voiceLogger.getContext();
      voiceLogger.stateTransition(previousState, 'speaking', 'TTS started', context);
    }

    textBufferRef.current.add(text);
  }, []);

  /**
   * Flush remaining text buffer to TTS
   */
  const flushTTS = useCallback(() => {
    if (textBufferRef.current) {
      const remaining = textBufferRef.current.forceFlush();
      if (remaining && wsManagerRef.current) {
        wsManagerRef.current.sendText(remaining, true);
      }
    }
  }, []);

  /**
   * Start conversation - KEY FIX: Start live transcription immediately
   */
  const startConversation = useCallback(async () => {
    if (isActiveRef.current) {
      log('Conversation already active');
      return;
    }

    log('Starting conversation');
    isActiveRef.current = true;
    setIsActive(true);

    try {
      // Initialize TTS
      await initializeTTS();

      // Start microphone
      await startMic();

      // Initialize and start live transcription IMMEDIATELY
      initializeLiveTranscription();
      
      if (liveTranscriptionRef.current) {
        const context = voiceLogger.getContext();
        voiceLogger.log('LiveTranscription', 'Starting', context);
        liveTranscriptionRef.current.start();
        
        // Also start recording for backup/fallback
        await startRecording();
      }

      // Reset accumulated transcript
      accumulatedTranscriptRef.current = '';
      setTranscript('');
      setLiveTranscript('');

      // Set state to listening
      setState('listening');
      stateRef.current = 'listening';

      log('Conversation started, live transcription active, listening...');
    } catch (error: any) {
      log('Failed to start conversation:', error);
      isActiveRef.current = false;
      setIsActive(false);
      setState('error');
      stateRef.current = 'error';
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [initializeTTS, startMic, initializeLiveTranscription, startRecording, onError, log]);

  /**
   * End conversation
   */
  const endConversation = useCallback(() => {
    const context = voiceLogger.getContext();
    voiceLogger.log('Conversation', 'Ending', context);
    
    isActiveRef.current = false;
    isBargingInRef.current = false;

    // Stop live transcription
    if (liveTranscriptionRef.current) {
      liveTranscriptionRef.current.stop();
      liveTranscriptionRef.current = null;
    }

    // Stop recording
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    }

    // Stop microphone
    stopMic();

    // Disconnect WebSocket
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

    // Abort OpenAI if active
    if (openaiAbortControllerRef.current) {
      openaiAbortControllerRef.current.abort();
      openaiAbortControllerRef.current = null;
    }

    // Reset state
    const previousState = stateRef.current;
    setState('idle');
    stateRef.current = 'idle';
    voiceLogger.stateTransition(previousState, 'idle', 'conversation ended', context);
    setTranscript('');
    setLiveTranscript('');
    accumulatedTranscriptRef.current = '';
    
    ttsFirstChunkTimeRef.current = null;

    voiceLogger.log('Conversation', 'Ended', context);
  }, [stopMic]);

  /**
   * Pause conversation
   */
  const pauseConversation = useCallback(() => {
    if (!isActiveRef.current) return;

    log('Pausing conversation');

    // Pause live transcription
    if (liveTranscriptionRef.current) {
      liveTranscriptionRef.current.stop();
    }

    // Pause audio if playing
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    // Stop microphone
    stopMic();

    // Stop recording
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    }

    setState('idle');
    stateRef.current = 'idle';
  }, [stopMic, log]);

  /**
   * Resume conversation
   */
  const resumeConversation = useCallback(async () => {
    if (!isActiveRef.current) {
      await startConversation();
      return;
    }

    log('Resuming conversation');

    try {
      // Resume audio if paused
      if (audioPlayerRef.current) {
        const isPaused = audioPlayerRef.current.getIsPaused();
        if (isPaused) {
          await audioPlayerRef.current.resume();
          if (audioPlayerRef.current.getIsPlaying()) {
            setState('speaking');
            stateRef.current = 'speaking';
            await startMic();
            // Resume live transcription
            if (liveTranscriptionRef.current) {
              liveTranscriptionRef.current.start();
            }
            return;
          }
        }
      }

      // Otherwise, restart listening with live transcription
      await startMic();
      
      // Restart live transcription
      if (liveTranscriptionRef.current) {
        liveTranscriptionRef.current.start();
      } else {
        initializeLiveTranscription();
        // Re-check ref after initialization
        // TypeScript doesn't know initializeLiveTranscription sets the ref, so we need to check again
        const transcription = liveTranscriptionRef.current;
        if (transcription) {
          (transcription as LiveTranscription).start();
        }
      }

      // Restart recording
      if (!isRecordingRef.current) {
        await startRecording();
      }

      setState('listening');
      stateRef.current = 'listening';
    } catch (error: any) {
      log('Failed to resume conversation:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [startMic, startConversation, initializeLiveTranscription, startRecording, onError, log]);

  /**
   * Set OpenAI abort controller (for barge-in)
   */
  const setOpenAIAbortController = useCallback((controller: AbortController | null) => {
    openaiAbortControllerRef.current = controller;
  }, []);

  /**
   * Detect speech start (VAD callback)
   */
  const detectSpeechStart = useCallback(async () => {
    if (stateRef.current === 'listening' && isActiveRef.current) {
      log('Speech start detected (VAD)');
      // Live transcription is already running, just log the event
    } else if (stateRef.current === 'speaking' && isActiveRef.current) {
      log('Speech detected during speaking - BARGE-IN');
      handleBargeIn();
    }
  }, [handleBargeIn, log]);

  /**
   * Handle pause during speech - send accumulated transcript
   */
  const handlePauseDuringSpeech = useCallback(async () => {
    if (accumulatedTranscriptRef.current.trim().length > 0 && isActiveRef.current) {
      const finalTranscript = accumulatedTranscriptRef.current.trim();
      log(`Pause during speech detected - sending accumulated transcript: "${finalTranscript}"`);
      
      // Reset for next utterance
      accumulatedTranscriptRef.current = '';
      setTranscript('');
      setLiveTranscript('');

      // Update state to thinking
      setState('thinking');
      stateRef.current = 'thinking';

      // Send transcript to parent
      onTranscriptComplete?.(finalTranscript);
    }
  }, [onTranscriptComplete, log]);

  /**
   * Detect speech end (VAD callback) - longer pause
   */
  const detectSpeechEnd = useCallback(async () => {
    if (accumulatedTranscriptRef.current.trim().length > 0 && isActiveRef.current) {
      const finalTranscript = accumulatedTranscriptRef.current.trim();
      const context = voiceLogger.getContext();
      voiceLogger.log('VAD', `Speech end detected - final transcript: "${finalTranscript.substring(0, 50)}${finalTranscript.length > 50 ? '...' : ''}"`, context);
      
      // Reset for next utterance
      accumulatedTranscriptRef.current = '';
      setTranscript('');
      setLiveTranscript('');

      // Update state to thinking
      const previousState = stateRef.current;
      setState('thinking');
      stateRef.current = 'thinking';
      voiceLogger.stateTransition(previousState, 'thinking', 'transcript received', context);

      // Send transcript to parent
      onTranscriptComplete?.(finalTranscript);
    } else {
      voiceLogger.log('VAD', 'Speech end detected but no transcript - continuing to listen', voiceLogger.getContext());
    }
  }, [onTranscriptComplete]);

  /**
   * Get the current media stream (for VAD initialization)
   */
  const getStreamRef = useCallback((): MediaStream | null => {
    return streamRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endConversation();
    };
  }, [endConversation]);

  return {
    state,
    isActive,
    transcript,
    liveTranscript,
    startConversation,
    endConversation,
    pauseConversation,
    resumeConversation,
    streamToTTS,
    flushTTS,
    handleBargeIn,
    setOpenAIAbortController,
    detectSpeechStart,
    detectSpeechEnd,
    handlePauseDuringSpeech,
    getStreamRef,
  };
}
