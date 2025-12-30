"use client";

import { Pencil, Search, MessageSquare, X, Trash2, Plus, ChevronLeft } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface Chat {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: Date;
  unread?: number;
}

interface SidebarProps {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  chats?: Chat[];
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onDeleteAllChats?: () => void;
  selectedChatId?: string;
}

export default function Sidebar({
  isSidebarOpen,
  toggleSidebar,
  chats = [],
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onDeleteAllChats,
  selectedChatId,
}: SidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const filteredChats = chats.filter(
    (chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTimestamp = (date?: Date | string | null) => {
    if (!date) return "";
    
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      return "";
    }
    
    if (isNaN(dateObj.getTime())) {
      return "";
    }
    
    const now = new Date();
    const diff = now.getTime() - dateObj.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (days === 1) return "Yesterday";
    if (days < 7) return dateObj.toLocaleDateString([], { weekday: "short" });
    return dateObj.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <aside className="w-64 min-w-[256px] max-w-[80vw] border-r border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-sm font-semibold text-foreground">ICP Builder</h1>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Close sidebar"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Actions */}
      <div className="p-3 space-y-2 border-b border-border">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>New chat</span>
        </button>

        {isSearchOpen ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-primary/20">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
            />
            <button
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery("");
              }}
              className="rounded-sm p-0.5 hover:bg-muted flex-shrink-0"
              aria-label="Close search"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
          </button>
        )}
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-medium text-muted-foreground">Recent</h2>
          {chats.length > 0 && onDeleteAllChats && (
            <button
              onClick={onDeleteAllChats}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              title="Delete all chats"
            >
              Clear all
            </button>
          )}
        </div>
        
        <div className="space-y-1">
          {filteredChats.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground mb-1">
                {searchQuery ? "No chats found" : "No conversations yet"}
              </p>
              {!searchQuery && (
                <p className="text-xs text-muted-foreground/80">
                  Start a new chat to begin
                </p>
              )}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`group relative rounded-lg transition-all ${
                  selectedChatId === chat.id
                    ? "bg-muted/80"
                    : "hover:bg-muted/50"
                }`}
              >
                <button
                  onClick={() => onSelectChat?.(chat.id)}
                  className="w-full px-3 py-2.5 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate mb-0.5">
                        {chat.title}
                      </p>
                      {chat.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate">
                          {chat.lastMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {chat.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(chat.timestamp)}
                        </span>
                      )}
                      {chat.unread && chat.unread > 0 && (
                        <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary px-1.5 text-xs font-medium text-white">
                          {chat.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {onDeleteChat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this chat?')) {
                        onDeleteChat(chat.id);
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
