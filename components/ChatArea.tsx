"use client";

/**
 * ChatArea - Main chat display component
 * Claude-inspired design with clean message bubbles and smooth animations
 */

import { User, FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { MessageDisplay } from "@/types/chat";

interface Message extends MessageDisplay { }

interface ChatAreaProps {
  messages?: Message[];
  isLoading?: boolean;
  voiceState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
  isVoiceActive?: boolean;
  voiceTranscript?: string;
  voiceLiveTranscript?: string;
  isProcessingPDF?: boolean;
  isTranscribing?: boolean;
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
  isProcessingPDF = false,
  isTranscribing = false,
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
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden">
            <img
              src="/Alex-Profile.png"
              alt="Alex Profile"
              className="h-full w-full object-cover"
            />
          </div>
          <h3 className="mb-3 text-xl font-semibold text-foreground">Welcome to ICP Builder</h3>
          <p className="mb-8 text-sm text-muted-foreground leading-relaxed">
            Hi, I'm Alex. I'll help you create your Ideal Customer Profile through conversation.
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
            className={`flex gap-4 animate-fade-in ${message.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
          >
            {/* Avatar */}
            <div className={`flex-shrink-0 flex items-start`}>
              {message.role === "user" ? (
                <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background`}>
                  <User className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden">
                  <img
                    src="/Alex-Profile.png"
                    alt="Alex Profile"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </div>

            {/* Message Content */}
            <div className={`flex-1 min-w-0 ${message.role === "user" ? "text-right" : "text-left"}`}>
              <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "user"
                  ? "bg-foreground text-background"
                  : message.content.toLowerCase().includes('error') || message.content.toLowerCase().includes('encountered')
                    ? "bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400"
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

                <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${message.role === "user" ? "text-left" : ""
                  }`}>
                  {message.content}
                </p>
              </div>

              {message.timestamp && (
                <p className={`mt-2 text-xs ${message.role === "user" ? "text-right" : "text-left"
                  } text-muted-foreground`}>
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Voice Mode State Indicators - Removed speaking indicator (orb already shows this) */}

        {/* PDF Processing indicator */}
        {isProcessingPDF && (
          <div className="flex gap-4 animate-fade-in">
            <div className="flex-shrink-0 flex items-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden">
                <img
                  src="/Alex-Profile.png"
                  alt="Alex Profile"
                  className="h-full w-full object-cover"
                />
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
                  <span className="text-sm text-muted-foreground">Processing PDF: Extracting text and analyzing ICP data...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Transcription (while speaking) */}
        {voiceLiveTranscript && voiceState === 'listening' && (
          <div className="flex gap-4 animate-fade-in">
            <div className="flex-shrink-0 flex items-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background">
                <User className="h-4 w-4" />
              </div>
            </div>
            <div className="flex-1 min-w-0 text-right">
              <div className="inline-block max-w-[85%] rounded-2xl bg-foreground/80 text-background px-4 py-3 border-2 border-dashed border-background/30">
                <p className="text-[15px] leading-relaxed text-left italic opacity-80">
                  {voiceLiveTranscript}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STT Transcription indicator */}
        {isTranscribing && voiceState === 'thinking' && (
          <div className="flex gap-4 animate-fade-in">
            <div className="flex-shrink-0 flex items-start">
              <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden">
                <img
                  src="/Alex-Profile.png"
                  alt="Alex Profile"
                  className="h-full w-full object-cover"
                />
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
                  <span className="text-sm text-muted-foreground">Transcribing your speech...</span>
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
