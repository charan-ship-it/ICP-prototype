"use client";

import { Send, Paperclip, X, FileText } from "lucide-react";
import { useState, useRef, useEffect } from "react";

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
      const lineHeight = 24;
      const rows = Math.min(Math.floor(scrollHeight / lineHeight), maxRows);
      textarea.style.height = `${rows * lineHeight + 16}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSend = () => {
    if ((message.trim() || attachedFile) && !disabled) {
      onSend?.(message.trim() || '[File attachment]', attachedFile || undefined);
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
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a PDF, Word document, or text file');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      setAttachedFile(file);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
  };

  return (
    <div className="bg-background">
      <div className="px-4 py-4 mx-auto max-w-3xl" style={{ boxSizing: 'content-box' }}>
        {/* File attachment preview */}
        {attachedFile && (
          <div className="mb-3 animate-fade-in">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {attachedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(attachedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={handleRemoveFile}
                className="flex-shrink-0 rounded-lg p-1.5 hover:bg-muted transition-colors"
                aria-label="Remove file"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}
        
        {/* Main input container */}
        <div className="relative">
          <div className="flex items-end gap-0 rounded-3xl border-2 border-border bg-background shadow-sm focus-within:border-primary/30 focus-within:shadow-md transition-all overflow-hidden">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              onChange={handleFileChange}
              className="hidden"
              aria-label="File input"
            />
            
            {/* Attach button */}
            <button
              onClick={handleFileAttach}
              disabled={disabled}
              className="p-3 hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
              aria-label="Attach file"
              title="Attach file (PDF, Word, or Text)"
            >
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </button>
            
            {/* Text input */}
            <div className="flex-1 min-w-0 flex items-center">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voiceActive ? "Voice mode is active..." : "Message ICP Builder..."}
                disabled={disabled}
                className="w-full resize-none bg-transparent px-0 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed leading-6"
                rows={1}
                style={{ minHeight: "56px", maxHeight: `${maxRows * 24 + 32}px` }}
              />
            </div>
            
            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={(!message.trim() && !attachedFile) || disabled}
              className="p-3 bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground transition-all flex-shrink-0 rounded-full flex items-center justify-center m-1.5"
              aria-label="Send message"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Helper text */}
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  );
}
