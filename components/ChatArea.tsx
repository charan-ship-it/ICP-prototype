"use client";

/**
 * ChatArea - Main chat display component
 * Claude-inspired design with clean message bubbles and smooth animations
 */

import { Sparkles, Bot, User, FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { MessageDisplay } from "@/types/chat";

interface Message extends MessageDisplay {}

interface ChatAreaProps {
  messages?: Message[];
  isLoading?: boolean;
  voiceState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isVoiceActive?: boolean;
  voiceTranscript?: string;
  voiceLiveTranscript?: string;
  onConfirmSection?: (section: string) => void;
  onEditField?: (field: keyof import("@/types/icp").ICPData, value: string) => void;
}

export default function ChatArea({ 
  messages = [], 
  isLoading = false,
  voiceState = 'idle',
  isVoiceActive = false,
  voiceTranscript = '',
  voiceLiveTranscript = '',
  onConfirmSection,
  onEditField,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading, voiceState, isVoiceActive]);

  if (messages.length === 0 && !isVoiceActive) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="text-center max-w-lg animate-fade-in">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <h3 className="mb-3 text-xl font-semibold text-foreground">Welcome to ICP Builder</h3>
          <p className="mb-8 text-sm text-muted-foreground leading-relaxed">
            I'll help you create your Ideal Customer Profile through conversation. 
            Ask me anything or start by telling me about your business.
          </p>
          <div className="space-y-3 text-left rounded-xl border border-border bg-muted/30 p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Try asking:
            </p>
            <ul className="space-y-2.5">
              {[
                "What is an Ideal Customer Profile?",
                "How do I identify my target customers?",
                "What information do you need to build my ICP?",
              ].map((question, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground group cursor-pointer hover:text-primary transition-colors">
                  <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-primary group-hover:scale-125 transition-transform"></span>
                  <span className="leading-relaxed">{question}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={chatContainerRef} className="flex flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex gap-4 animate-fade-in ${
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            {/* Avatar */}
            <div className={`flex-shrink-0 flex items-start`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                message.role === "user" 
                  ? "bg-foreground text-background" 
                  : "bg-primary/10 text-primary"
              }`}>
                {message.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
            </div>

            {/* Message Content */}
            <div className={`flex-1 min-w-0 ${message.role === "user" ? "text-right" : "text-left"}`}>
              <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-foreground text-background"
                  : "bg-muted/80 text-foreground"
              }`}>
                {/* File attachment preview */}
                {message.role === "user" && message.fileAttachment && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 rounded-lg border border-background/20 bg-background/10 px-3 py-2">
                      <FileText className="h-4 w-4 text-background" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-medium text-background truncate">
                          {message.fileAttachment.name}
                        </p>
                        <p className="text-xs text-background/70">
                          {(message.fileAttachment.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              </div>
              
              {message.timestamp && (
                <p className={`mt-2 text-xs ${
                  message.role === "user" ? "text-right" : "text-left"
                } text-muted-foreground`}>
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        ))}
      
        {/* Voice Mode State Indicators */}
        {isVoiceActive && (
          <>
            {voiceState === 'thinking' && (
              <div className="flex gap-4 animate-fade-in">
                <div className="flex-shrink-0 flex items-start">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-block rounded-2xl bg-muted/80 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }}></div>
                        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }}></div>
                        <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {voiceState === 'speaking' && (
              <div className="flex gap-4 animate-fade-in">
                <div className="flex-shrink-0 flex items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex items-center">
                  <div className="inline-block rounded-2xl bg-muted/80 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 items-center">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1 bg-primary rounded-full animate-pulse"
                            style={{
                              height: `${12 + Math.random() * 8}px`,
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-foreground ml-2">Speaking...</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Text mode loading indicator */}
        {isLoading && !isVoiceActive && (
          <div className="flex gap-4 animate-fade-in">
            <div className="flex-shrink-0 flex items-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-block rounded-2xl bg-muted/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }}></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }}></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Processing...</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
