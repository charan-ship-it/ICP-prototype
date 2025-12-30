"use client";

/**
 * VoicePanel - Claude-inspired Voice Mode UI
 * Clean, minimal design with smooth animations
 */

import { Play, Pause, Mic, AlertCircle, Volume2, VolumeX, Radio } from "lucide-react";
import { useState } from "react";

interface VoicePanelProps {
  sessionId: string | null;
  streamingAIContent?: string;
  isAILoading?: boolean;
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isConversationActive: boolean;
  transcript: string;
  liveTranscript?: string;
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
      case 'listening': return 'Listening';
      case 'thinking': return 'Processing';
      case 'speaking': return 'Speaking';
      case 'error': return 'Error';
      default: return isConversationActive ? 'Paused' : 'Voice Mode';
    }
  };

  const getStateDescription = (): string => {
    switch (voiceState) {
      case 'listening': return 'Speak naturally, I\'m listening';
      case 'thinking': return 'Processing your message';
      case 'speaking': return 'AI is responding';
      case 'error': return 'Something went wrong';
      default: return isConversationActive ? 'Click play to resume' : 'Start a voice conversation';
    }
  };

  return (
    <aside className="w-80 min-w-[320px] max-w-[80vw] border-l border-border bg-background">
      <div className="flex h-full flex-col p-6" style={{ height: '730px' }}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Voice Assistant</h3>
              <p className="text-xs text-muted-foreground">Natural conversation mode</p>
            </div>
          </div>
        </div>

        {/* Voice Orb */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 min-h-0">
          {/* Main Orb Container */}
          <div className="relative">
            {/* Animated rings for active states */}
            {(voiceState === 'listening' || voiceState === 'speaking') && (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring" />
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring" style={{ animationDelay: '1s' }} />
              </>
            )}
            
            {/* Main orb */}
            <div
              className={`relative h-40 w-40 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                voiceState === 'listening' 
                  ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 shadow-lg shadow-primary/20' 
                  : voiceState === 'thinking'
                  ? 'bg-gradient-to-br from-muted to-muted/50 border-border'
                  : voiceState === 'speaking'
                  ? 'bg-gradient-to-br from-primary/30 to-primary/10 border-primary/40 shadow-lg shadow-primary/20'
                  : voiceState === 'error'
                  ? 'bg-gradient-to-br from-destructive/20 to-destructive/5 border-destructive/30'
                  : 'bg-gradient-to-br from-muted to-muted/30 border-border'
              }`}
            >
              {/* Icon */}
              <div className="relative z-10">
                {voiceState === 'listening' && (
                  <Mic className="h-16 w-16 text-primary drop-shadow-lg" />
                )}
                
                {voiceState === 'thinking' && (
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                
                {voiceState === 'speaking' && (
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 bg-primary rounded-full animate-pulse"
                        style={{
                          height: `${20 + Math.random() * 16}px`,
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                
                {voiceState === 'idle' && !isConversationActive && (
                  <VolumeX className="h-16 w-16 text-muted-foreground" />
                )}
                
                {voiceState === 'idle' && isConversationActive && (
                  <Volume2 className="h-16 w-16 text-muted-foreground" />
                )}
                
                {voiceState === 'error' && (
                  <AlertCircle className="h-16 w-16 text-destructive" />
                )}
              </div>
            </div>
          </div>

          {/* State Label */}
          <div className="text-center space-y-1.5">
            <p className={`text-lg font-semibold ${
              voiceState === 'error' ? 'text-destructive' : 'text-foreground'
            }`}>
              {getStateLabel()}
            </p>
            <p className="text-sm text-muted-foreground max-w-[200px]">
              {getStateDescription()}
            </p>
          </div>

          {/* Pause/Resume Control */}
          {isConversationActive && (
            <button
              onClick={handlePlayPause}
              className="rounded-full p-4 bg-muted/50 hover:bg-muted border border-border transition-all hover:scale-105 active:scale-95 shadow-sm"
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

        {/* Action Button */}
        <div className="pt-6 border-t border-border space-y-3">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-xs text-destructive leading-relaxed">{errorMessage}</p>
            </div>
          )}
          <button
            onClick={handleConversationToggle}
            className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition-all shadow-sm ${
              isConversationActive
                ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                : "bg-primary text-white hover:bg-primary/90 shadow-primary/20"
            }`}
          >
            {isConversationActive ? "End Conversation" : "Start Voice Mode"}
          </button>
        </div>
      </div>
    </aside>
  );
}
