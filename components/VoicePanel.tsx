"use client";

/**
 * VoicePanel - ChatGPT-like Voice Mode UI
 * 
 * Shows simple state indicators:
 * - Listening: Animated orb, no transcript shown (like ChatGPT)
 * - Thinking: Processing indicator
 * - Speaking: Audio visualization
 * 
 * No live transcription display - waits for complete utterance
 */

import { Play, Pause, User, Mic, MicOff, AlertCircle, Volume2 } from "lucide-react";
import { useState } from "react";

interface VoicePanelProps {
  sessionId: string | null;
  streamingAIContent?: string;
  isAILoading?: boolean;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isConversationActive: boolean;
  transcript: string;
  liveTranscript?: string; // Kept for API compatibility, not displayed
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConversationToggle = async () => {
    if (isConversationActive) {
      setErrorMessage(null);
      await endConversation();
    } else {
      setErrorMessage(null);
      try {
        await startConversation();
      } catch (error) {
        console.error('Failed to start conversation:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to start conversation';
        setErrorMessage(errorMsg);
      }
    }
  };

  const handlePlayPause = () => {
    if (!isConversationActive) return;
    
    if (voiceState === 'listening' || voiceState === 'speaking') {
      pauseConversation();
    } else if (voiceState === 'idle') {
      resumeConversation();
    }
  };

  const getStateLabel = (): string => {
    switch (voiceState) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'Processing...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return isConversationActive ? 'Paused' : 'Ready';
    }
  };

  const getStateColor = (): string => {
    switch (voiceState) {
      case 'listening': return 'from-blue-500/20 to-blue-500/5 border-blue-500/30';
      case 'thinking': return 'from-amber-500/20 to-amber-500/5 border-amber-500/30';
      case 'speaking': return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
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
                Voice mode - speak naturally, I'll listen and respond
              </p>
            </div>
          </div>
        </div>

        {/* Voice Orb and State */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 min-h-0">
          {/* Main Orb */}
          <div className="relative">
            <div
              className={`relative h-48 w-48 rounded-full bg-gradient-to-br ${getStateColor()} border-2 flex items-center justify-center transition-all duration-300`}
            >
              {/* Animated rings for active states */}
              {voiceState === 'listening' && (
                <>
                  <div className="absolute h-48 w-48 rounded-full border-2 border-blue-500/40 animate-ping" />
                  <div className="absolute h-56 w-56 rounded-full border border-blue-500/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                  <div className="absolute h-64 w-64 rounded-full border border-blue-500/10 animate-ping" style={{ animationDelay: '1s' }} />
                </>
              )}
              
              {voiceState === 'thinking' && (
                <>
                  <div className="absolute h-48 w-48 rounded-full border-2 border-amber-500/30 animate-pulse" />
                  <div className="absolute h-52 w-52 rounded-full border border-amber-500/20 animate-pulse" style={{ animationDelay: '0.3s' }} />
                </>
              )}
              
              {voiceState === 'speaking' && (
                <>
                  <div className="absolute h-48 w-48 rounded-full border-2 border-emerald-500/40 animate-pulse" />
                  <div className="absolute h-56 w-56 rounded-full border border-emerald-500/25 animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <div className="absolute h-64 w-64 rounded-full border border-emerald-500/15 animate-pulse" style={{ animationDelay: '0.4s' }} />
                </>
              )}

              {/* Center content */}
              <div className="text-center z-10">
                <div className="h-24 w-24 rounded-full bg-background/80 backdrop-blur mx-auto flex items-center justify-center shadow-lg">
                  {voiceState === 'listening' && (
                    <div className="relative">
                      <Mic className="h-10 w-10 text-blue-500" />
                      {/* Audio level indicator */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        <div className="h-2 w-0.5 bg-blue-500 animate-[pulse_0.5s_ease-in-out_infinite]" />
                        <div className="h-3 w-0.5 bg-blue-500 animate-[pulse_0.5s_ease-in-out_infinite_0.1s]" />
                        <div className="h-4 w-0.5 bg-blue-500 animate-[pulse_0.5s_ease-in-out_infinite_0.2s]" />
                        <div className="h-3 w-0.5 bg-blue-500 animate-[pulse_0.5s_ease-in-out_infinite_0.3s]" />
                        <div className="h-2 w-0.5 bg-blue-500 animate-[pulse_0.5s_ease-in-out_infinite_0.4s]" />
                      </div>
                    </div>
                  )}
                  
                  {voiceState === 'thinking' && (
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-3 w-3 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-3 w-3 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                  
                  {voiceState === 'speaking' && (
                    <div className="relative">
                      <Volume2 className="h-10 w-10 text-emerald-500" />
                      {/* Speaking animation */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        <div className="h-2 w-1 bg-emerald-500 animate-[pulse_0.4s_ease-in-out_infinite]" />
                        <div className="h-4 w-1 bg-emerald-500 animate-[pulse_0.4s_ease-in-out_infinite_0.1s]" />
                        <div className="h-5 w-1 bg-emerald-500 animate-[pulse_0.4s_ease-in-out_infinite_0.2s]" />
                        <div className="h-4 w-1 bg-emerald-500 animate-[pulse_0.4s_ease-in-out_infinite_0.3s]" />
                        <div className="h-2 w-1 bg-emerald-500 animate-[pulse_0.4s_ease-in-out_infinite_0.4s]" />
                      </div>
                    </div>
                  )}
                  
                  {voiceState === 'idle' && !isConversationActive && (
                    <MicOff className="h-10 w-10 text-muted-foreground" />
                  )}
                  
                  {voiceState === 'idle' && isConversationActive && (
                    <Mic className="h-10 w-10 text-primary/50" />
                  )}
                  
                  {voiceState === 'error' && (
                    <AlertCircle className="h-10 w-10 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* State Label */}
          <div className="text-center">
            <p className={`text-lg font-medium ${
              voiceState === 'listening' ? 'text-blue-500' :
              voiceState === 'thinking' ? 'text-amber-500' :
              voiceState === 'speaking' ? 'text-emerald-500' :
              voiceState === 'error' ? 'text-red-500' :
              'text-muted-foreground'
            }`}>
              {getStateLabel()}
            </p>
            {isConversationActive && voiceState === 'listening' && (
              <p className="text-xs text-muted-foreground mt-1">
                Speak naturally, I'm listening...
              </p>
            )}
            {isConversationActive && voiceState === 'idle' && (
              <p className="text-xs text-muted-foreground mt-1">
                Press play to resume
              </p>
            )}
          </div>

          {/* Pause/Resume Control */}
          {isConversationActive && (
            <button
              onClick={handlePlayPause}
              className="rounded-full p-4 bg-muted hover:bg-muted/80 border border-border transition-all hover:scale-105 active:scale-95"
              aria-label={voiceState === 'idle' ? "Resume" : "Pause"}
              type="button"
            >
              {voiceState === 'idle' ? (
                <Play className="h-6 w-6 ml-0.5 text-foreground" />
              ) : (
                <Pause className="h-6 w-6 text-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Conversation Toggle */}
        <div className="pt-4 border-t border-border space-y-3">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive leading-relaxed">{errorMessage}</p>
            </div>
          )}
          <button
            onClick={handleConversationToggle}
            className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors shadow-sm ${
              isConversationActive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isConversationActive ? "End Conversation" : "Start Voice Mode"}
          </button>
          
          {!isConversationActive && (
            <p className="text-xs text-center text-muted-foreground">
              Voice mode works like ChatGPT - speak naturally
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
