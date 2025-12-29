"use client";

import { Send, Paperclip } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
  voiceActive?: boolean;
}

export default function ChatInput({ onSend, disabled = false, voiceActive = false }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxRows = 6;

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = 24; // Approximate line height
      const rows = Math.min(Math.floor(scrollHeight / lineHeight), maxRows);
      textarea.style.height = `${rows * lineHeight + 12}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend?.(message.trim());
      setMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="mx-auto flex max-w-4xl items-end gap-2">
        <button
          disabled={disabled}
          className="rounded-lg p-2 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Attach file"
        >
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1 rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 transition-shadow">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voiceActive ? "Voice mode active - use the voice panel to speak..." : "Type your message... (Press Enter to send, Shift+Enter for new line)"}
            disabled={disabled}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            rows={1}
            style={{ minHeight: "48px", maxHeight: `${maxRows * 24 + 12}px` }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-4xl text-xs text-muted-foreground text-center">
        {voiceActive ? (
          <span className="text-primary font-medium">🎤 Voice mode is active - use the voice panel on the right to speak</span>
        ) : (
          <>
            Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted rounded border border-border">Enter</kbd> to send,{" "}
            <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted rounded border border-border">Shift + Enter</kbd> for new line
          </>
        )}
      </p>
    </div>
  );
}

