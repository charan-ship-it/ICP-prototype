/**
 * Voice System Types
 * Clean, centralized type definitions for the voice conversation system
 */

// Voice conversation states
export type VoiceState = 
  | 'idle'       // Not in a conversation
  | 'listening'  // Actively listening to user
  | 'processing' // Transcribing/sending to AI
  | 'speaking'   // AI is speaking
  | 'error';     // Error state

// State transitions
export interface StateTransition {
  from: VoiceState;
  to: VoiceState;
  reason: string;
  timestamp: number;
}

// Audio recording options
export interface AudioRecorderOptions {
  onDataAvailable?: (blob: Blob) => void;
  onError?: (error: Error) => void;
  mimeType?: string;
  timeslice?: number; // ms between data chunks
}

// VAD (Voice Activity Detection) options
export interface VADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onSilenceTimeout?: () => void;
  energyThreshold?: number;      // Minimum energy to detect speech
  speechStartDelay?: number;     // ms of speech before confirming start
  silenceTimeout?: number;       // ms of silence before triggering end
  sampleRate?: number;
}

// Speech-to-Text options
export interface STTOptions {
  language?: string;
  model?: string;
}

// Text-to-Speech options
export interface TTSOptions {
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}

// Audio playback options
export interface AudioPlayerOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
}

// Voice conversation hook options
export interface VoiceConversationOptions {
  onTranscript?: (text: string) => void;
  onStateChange?: (state: VoiceState) => void;
  onError?: (error: Error) => void;
  onAudioChunkReceived?: () => void; // Called when TTS audio is received - for text sync
  ttsOptions?: Partial<TTSOptions>;
  sttOptions?: Partial<STTOptions>;
  vadOptions?: Partial<VADOptions>;
}

// Voice conversation return type
export interface VoiceConversationReturn {
  // State
  state: VoiceState;
  isActive: boolean;
  error: Error | null;
  
  // Actions
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => Promise<void>;
  
  // TTS streaming
  streamText: (text: string) => void;
  flushText: () => void;
  
  // For barge-in from parent
  interruptPlayback: () => void;
  
  // Manual send when VAD doesn't detect speech end
  forceEndSpeech: () => void;
}

// Audio chunk from TTS
export interface AudioChunk {
  audio: ArrayBuffer;
  isFinal: boolean;
}

// Transcription result
export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

// ElevenLabs WebSocket message types
export interface ElevenLabsMessage {
  text?: string;
  audio?: string; // base64 encoded
  isFinal?: boolean;
  error?: string;
  flush?: boolean;
}

// Voice logger entry
export interface VoiceLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  data?: Record<string, any>;
}

