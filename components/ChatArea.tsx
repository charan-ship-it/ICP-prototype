"use client";

import { MessageCircle, Sparkles, Mic, Brain, Volume2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatAreaProps {
  messages?: Message[];
  isLoading?: boolean;
  voiceState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isVoiceActive?: boolean;
  voiceTranscript?: string;
  voiceLiveTranscript?: string;
}

export default function ChatArea({ 
  messages = [], 
  isLoading = false,
  voiceState = 'idle',
  isVoiceActive = false,
  voiceTranscript = '',
  voiceLiveTranscript = '',
}: ChatAreaProps) {
  // Show empty state if no messages and voice is not active
  if (messages.length === 0 && !isVoiceActive) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Start a conversation</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Ask me anything about building your Ideal Customer Profile. I'm here to help you understand your customers better.
          </p>
          <div className="space-y-2 text-left">
            <p className="text-xs font-medium text-muted-foreground">Try asking:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                What is an Ideal Customer Profile?
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                How do I identify my target customers?
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-primary"></span>
                What questions should I ask to build an ICP?
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto bg-background p-6 md:p-8">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex w-full animate-in fade-in slide-in-from-bottom-2 ${
            message.role === "user" ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground border border-border/50"
          }`}
          >
            {message.role === "assistant" && (
              <div className="mb-2 flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">AI Assistant</span>
              </div>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            {message.timestamp && (
              <p className={`mt-2 text-xs ${message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      ))}
      
      {/* Voice Mode Active Indicators */}
      {isVoiceActive && (
        <>
          {/* Listening State - Show live transcript */}
          {voiceState === 'listening' && (voiceTranscript || voiceLiveTranscript) && (
            <div className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 bg-primary/10 border-2 border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-3.5 w-3.5 text-primary animate-pulse" />
                  <span className="text-xs font-medium text-primary">You (speaking...)</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  {voiceTranscript && <span className="opacity-70">{voiceTranscript} </span>}
                  {voiceLiveTranscript && <span className="font-medium">{voiceLiveTranscript}</span>}
                </p>
              </div>
            </div>
          )}
          
          {/* Thinking State */}
          {voiceState === 'thinking' && (
            <div className="flex w-full justify-start animate-in fade-in">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-yellow-500/10 px-4 py-3 border-2 border-yellow-500/30">
                <div className="flex items-center gap-3">
                  <Brain className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500 [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500 [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-yellow-600 dark:bg-yellow-500"></div>
                  </div>
                  <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">AI is thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Speaking State */}
          {voiceState === 'speaking' && (
            <div className="flex w-full justify-start animate-in fade-in">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-green-500/10 px-4 py-3 border-2 border-green-500/30">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-4 w-4 text-green-600 dark:text-green-500 animate-pulse" />
                  <div className="flex gap-1">
                    <div className="h-3 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                    <div className="h-4 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                    <div className="h-5 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.4s]" />
                    <div className="h-4 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite_0.2s]" />
                    <div className="h-3 w-1 bg-green-600 dark:bg-green-500 animate-[pulse_0.6s_ease-in-out_infinite]" />
                  </div>
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">AI is speaking...</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Text mode loading indicator */}
      {isLoading && !isVoiceActive && (
        <div className="flex w-full justify-start">
          <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-muted px-4 py-3 border border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]"></div>
                <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"></div>
              </div>
              <span className="text-xs text-muted-foreground">AI is thinking...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
