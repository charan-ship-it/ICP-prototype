"use client";

import { Send, Paperclip } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import FileAttachmentCard from "./FileAttachmentCard";

interface ChatInputProps {
  onSend?: (message: string, file?: File) => void;
  disabled?: boolean;
  voiceActive?: boolean;
}

export default function ChatInput({ onSend, disabled = false, voiceActive = false }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if ((message.trim() || attachedFile) && !disabled) {
      // Send message with attached file if present
      onSend?.(message.trim() || '[File attachment]', attachedFile || undefined);
      
      // Clear message and file
      setMessage("");
      setAttachedFile(null);
      
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

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // Check file type (allow common document types)
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a PDF, Word document, or text file');
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // Store file in state - don't extract content yet
      setAttachedFile(file);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        {/* File attachment card */}
        {attachedFile && (
          <FileAttachmentCard
            file={attachedFile}
            onRemove={handleRemoveFile}
            status="pending"
          />
        )}
        
        {/* Floating chat input container */}
        <div className="relative">
          <div className="flex items-end gap-0 rounded-2xl border border-border bg-background shadow-sm focus-within:border-border focus-within:shadow-md transition-all">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileChange}
              className="hidden"
              aria-label="File input"
            />
            <button
              onClick={handleFileAttach}
              disabled={disabled}
              className="rounded-l-2xl p-3 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Attach file"
              title="Attach file (PDF, Word, or Text)"
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voiceActive ? "Voice mode active..." : "Message..."}
                disabled={disabled}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                rows={1}
                style={{ minHeight: "52px", maxHeight: `${maxRows * 24 + 12}px` }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={(!message.trim() && !attachedFile) || disabled}
              className="rounded-r-2xl bg-foreground p-3 text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

