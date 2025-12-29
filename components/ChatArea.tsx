"use client";

import { MessageCircle, Sparkles } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatAreaProps {
  messages?: Message[];
  isLoading?: boolean;
}

export default function ChatArea({ messages = [], isLoading = false }: ChatAreaProps) {
  // Show empty state if no messages
  if (messages.length === 0) {
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
      
      {isLoading && (
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

