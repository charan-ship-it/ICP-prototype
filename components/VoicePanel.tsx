"use client";

import { Play, Pause, User, Mic, MicOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { createVAD } from "@/lib/vad";

interface VoicePanelProps {
  sessionId: string | null;
  streamingAIContent?: string;
  isAILoading?: boolean;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isConversationActive: boolean;
  transcript: string;
  liveTranscript?: string; // Live transcription (interim results)
  startConversation: () => Promise<void>;
  endConversation: () => Promise<void>;
  pauseConversation: () => void;
  resumeConversation: () => Promise<void>;
  detectSpeechStart: () => void;
  detectSpeechEnd: () => Promise<void>;
  handlePauseDuringSpeech: () => Promise<void>;
  getStreamRef: () => MediaStream | null;
}

export default function VoicePanel({ 
  sessionId,
  streamingAIContent = '',
  isAILoading = false,
  voiceState,
  isConversationActive,
  transcript,
  liveTranscript = '',
  startConversation,
  endConversation,
  pauseConversation,
  resumeConversation,
  detectSpeechStart,
  detectSpeechEnd,
  handlePauseDuringSpeech,
  getStreamRef,
}: VoicePanelProps) {
  const vadCleanupRef = useRef<(() => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadInitializedRef = useRef<boolean>(false);

  // Initialize VAD when conversation starts and we're in listening state
  useEffect(() => {
    if (isConversationActive && (voiceState === 'listening' || voiceState === 'speaking') && !vadInitializedRef.current) {
      const initializeVAD = async () => {
        try {
          // Get audio context
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (audioContextRef.current.state === 'suspended') {
              await audioContextRef.current.resume();
            }
          }

          const audioContext = audioContextRef.current;
          
          // Get media stream from voice hook
          const stream = getStreamRef();
          if (!stream) {
            console.warn('[VoicePanel] No stream available from voice hook, will retry');
            return;
          }

          const sourceNode = audioContext.createMediaStreamSource(stream);
          sourceNodeRef.current = sourceNode;

          // Create VAD
          const cleanup = createVAD(audioContext, sourceNode, {
            onSpeechStart: () => {
              detectSpeechStart();
            },
            onSpeechEnd: () => {
              detectSpeechEnd();
            },
            onPauseDuringSpeech: () => {
              handlePauseDuringSpeech();
            },
            energyThreshold: 0.03,
            speechStartMs: 150,
            pauseDuringSpeechMs: 1500, // 1.5s pause during speech = auto-send
            speechEndMs: 2500, // 2.5s complete silence = end
          });

          vadCleanupRef.current = cleanup;
          vadInitializedRef.current = true;
          console.log('[VoicePanel] VAD initialized - continuous listening active');
        } catch (error) {
          console.error('[VoicePanel] Failed to initialize VAD:', error);
        }
      };

      initializeVAD();
    } else if (!isConversationActive || (voiceState !== 'listening' && voiceState !== 'speaking')) {
      // Cleanup VAD when not in active listening/speaking state
      if (vadCleanupRef.current) {
        vadCleanupRef.current();
        vadCleanupRef.current = null;
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch (e) {
          // Ignore
        }
        sourceNodeRef.current = null;
      }
      vadInitializedRef.current = false;
    }

    return () => {
      if (vadCleanupRef.current) {
        vadCleanupRef.current();
        vadCleanupRef.current = null;
      }
      vadInitializedRef.current = false;
    };
  }, [isConversationActive, voiceState, detectSpeechStart, detectSpeechEnd, handlePauseDuringSpeech, getStreamRef]);


  const handleConversationToggle = async () => {
    if (isConversationActive) {
      await endConversation();
    } else {
      try {
        await startConversation();
      } catch (error) {
        console.error('Failed to start conversation:', error);
      }
    }
  };

  const handlePlayPause = () => {
    if (!isConversationActive) {
      handleConversationToggle();
      return;
    }
    
    if (voiceState === 'idle') {
      resumeConversation();
    } else {
      pauseConversation();
    }
  };

  const getStateLabel = (): string => {
    switch (voiceState) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return 'Ready';
    }
  };

  const getStateColor = (): string => {
    switch (voiceState) {
      case 'listening': return 'from-blue-500/20 to-blue-500/5 border-blue-500/30';
      case 'thinking': return 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30';
      case 'speaking': return 'from-green-500/20 to-green-500/5 border-green-500/30';
      case 'error': return 'from-red-500/20 to-red-500/5 border-red-500/30';
      default: return 'from-primary/20 to-primary/5 border-primary/20';
    }
  };

  return (
    <aside className="w-80 min-w-[320px] max-w-[80vw] border-l border-border bg-card p-4 h-full">
      <div className="flex h-full flex-col justify-between">
        {/* Agent Details */}
        <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Agent: Alex</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                I'm here to help you build your Ideal Customer Profile
              </p>
            </div>
          </div>
        </div>

        {/* Voice Orb and Controls */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 min-h-0">
          <div className="flex flex-col items-center justify-center gap-2">
            <div
              className={`relative h-48 w-48 rounded-full bg-gradient-to-br ${getStateColor()} border-2 flex items-center justify-center transition-all ${
                voiceState !== 'idle' ? "animate-pulse" : ""
              }`}
            >
              {voiceState !== 'idle' && (
                <>
                  <div className={`absolute h-48 w-48 rounded-full border-2 animate-ping ${
                    voiceState === 'listening' ? 'border-blue-500/30' :
                    voiceState === 'thinking' ? 'border-yellow-500/30' :
                    'border-green-500/30'
                  }`} />
                  <div className={`absolute h-56 w-56 rounded-full border animate-ping [animation-delay:0.5s] ${
                    voiceState === 'listening' ? 'border-blue-500/20' :
                    voiceState === 'thinking' ? 'border-yellow-500/20' :
                    'border-green-500/20'
                  }`} />
                </>
              )}
              <div className="text-center z-10">
                <div className="text-xs font-medium text-muted-foreground mb-1">{getStateLabel()}</div>
                <div className="h-24 w-24 rounded-full bg-primary/10 mx-auto flex items-center justify-center">
                  {voiceState === 'listening' && <Mic className="h-8 w-8 text-blue-500 animate-pulse" />}
                  {voiceState === 'thinking' && (
                    <div className="flex gap-1">
                      <div className="h-2 w-1 bg-yellow-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                      <div className="h-3 w-1 bg-yellow-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                      <div className="h-4 w-1 bg-yellow-500 animate-[pulse_0.6s_ease-in-out_infinite_0.4s]" />
                      <div className="h-3 w-1 bg-yellow-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                      <div className="h-2 w-1 bg-yellow-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    </div>
                  )}
                  {voiceState === 'speaking' && (
                    <div className="flex gap-1">
                      <div className="h-2 w-1 bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                      <div className="h-3 w-1 bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                      <div className="h-4 w-1 bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.4s]" />
                      <div className="h-3 w-1 bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                      <div className="h-2 w-1 bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    </div>
                  )}
                  {voiceState === 'idle' && !isConversationActive && <MicOff className="h-8 w-8 text-muted-foreground" />}
                  {voiceState === 'idle' && isConversationActive && <Mic className="h-8 w-8 text-blue-500 animate-pulse" />}
                </div>
              </div>
            </div>
            
            {(liveTranscript || transcript) && (
              <div className="max-w-full px-4 py-2 rounded-lg bg-muted border border-border">
                <p className="text-xs text-muted-foreground text-center">
                  {liveTranscript ? (
                    <>
                      <span className="opacity-50">{transcript}</span>
                      <span className="font-medium">{liveTranscript}</span>
                    </>
                  ) : (
                    transcript
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Media Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handlePlayPause}
              className="rounded-full p-3 hover:bg-accent border border-border transition-all hover:scale-105 active:scale-95"
                  aria-label={
                    isConversationActive && voiceState === 'idle' ? "Resume" : 
                    isConversationActive ? "Pause" : 
                    "Start Conversation"
                  }
                  type="button"
                >
                  {isConversationActive && voiceState === 'idle' ? (
                    <Play className="h-5 w-5 ml-0.5" />
                  ) : isConversationActive ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5" />
                  )}
            </button>
          </div>
        </div>

        {/* Conversation Toggle */}
        <div className="pt-4 border-t border-border">
          <button
            onClick={handleConversationToggle}
                className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors shadow-sm ${
                  isConversationActive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isConversationActive ? "End Conversation" : "Start Conversation"}
          </button>
        </div>
      </div>
    </aside>
  );
}
