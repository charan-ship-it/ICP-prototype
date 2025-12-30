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

import { Play, Pause, User, AlertCircle, Volume2, VolumeX } from "lucide-react";
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
      case 'listening': return 'from-muted to-muted/50 border-border';
      case 'thinking': return 'from-muted to-muted/50 border-border';
      case 'speaking': return 'from-muted to-muted/50 border-border';
      case 'error': return 'from-red-500/20 to-red-500/5 border-red-500/30';
      default: return 'from-muted to-muted/50 border-border';
    }
  };

  return (
    <aside className="w-80 min-w-[320px] max-w-[80vw] border-l border-border bg-card p-6 h-full">
      <div className="flex h-full flex-col justify-between">
        {/* Agent Details */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5 text-foreground" />
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
        <div className="flex flex-1 flex-col items-center justify-center gap-8 min-h-0 py-8">
          {/* Main Orb */}
          <div className="relative">
            <div
              className={`relative h-48 w-48 rounded-full bg-gradient-to-br ${getStateColor()} border flex items-center justify-center transition-all duration-300`}
            >

              {/* Center content */}
              <div className="text-center z-10">
                <div className="h-24 w-24 rounded-full bg-background mx-auto flex items-center justify-center">
                  {voiceState === 'listening' && (
                    <Volume2 className="h-12 w-12 text-foreground/60" />
                  )}
                  
                  {voiceState === 'thinking' && (
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-2.5 w-2.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-2.5 w-2.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                  
                  {voiceState === 'speaking' && (
                    <Volume2 className="h-12 w-12 text-foreground" />
                  )}
                  
                  {voiceState === 'idle' && !isConversationActive && (
                    <VolumeX className="h-12 w-12 text-muted-foreground" />
                  )}
                  
                  {voiceState === 'idle' && isConversationActive && (
                    <Volume2 className="h-12 w-12 text-foreground/40" />
                  )}
                  
                  {voiceState === 'error' && (
                    <AlertCircle className="h-12 w-12 text-red-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* State Label */}
          <div className="text-center space-y-1">
            <p className={`text-base font-medium ${
              voiceState === 'error' ? 'text-red-500' :
              'text-foreground'
            }`}>
              {getStateLabel()}
            </p>
            {isConversationActive && voiceState === 'listening' && (
              <p className="text-xs text-muted-foreground">
                Speak naturally, I'm listening...
              </p>
            )}
            {isConversationActive && voiceState === 'idle' && (
              <p className="text-xs text-muted-foreground">
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
        <div className="pt-6 border-t border-border space-y-3">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive leading-relaxed">{errorMessage}</p>
            </div>
          )}
          <button
            onClick={handleConversationToggle}
            className={`w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              isConversationActive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isConversationActive ? "End Conversation" : "Start Voice Mode"}
          </button>
        </div>
      </div>
    </aside>
  );
}
