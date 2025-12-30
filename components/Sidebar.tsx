"use client";

import { Pencil, Search, Cloud, ChevronRight, X, MessageSquare, Trash2 } from "lucide-react";
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
    
    // Handle different input types
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      return "";
    }
    
    // Check if date is valid
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
    <aside className="w-64 min-w-[256px] max-w-[80vw] border-r border-border bg-card">
      <div className="flex h-full flex-col">
        {/* ICP Builder Title + Toggle */}
        <div className="border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-foreground" />
            <h1 className="text-lg font-semibold">ICP Builder</h1>
            <button
              onClick={toggleSidebar}
              className="group relative ml-auto rounded-md p-1.5 hover:bg-accent transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex h-full flex-col p-4">
          <div className="mb-6 space-y-2">
            <button
              onClick={onNewChat}
              className="flex w-full items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              <span>New chat</span>
            </button>

            {/* Search - Expandable */}
            {isSearchOpen ? (
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="rounded p-1 hover:bg-accent"
                  aria-label="Close search"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Search className="h-4 w-4" />
                <span>Search chats</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chats</h2>
              {chats.length > 0 && onDeleteAllChats && (
                <button
                  onClick={onDeleteAllChats}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors font-medium"
                  title="Delete all chats"
                >
                  Delete All
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {filteredChats.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {searchQuery ? "No chats found" : "No chats yet"}
                  </p>
                  {!searchQuery && (
                    <p className="text-xs text-muted-foreground">
                      Start a new conversation to get started
                    </p>
                  )}
                </div>
              ) : (
                filteredChats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group relative w-full rounded-lg transition-colors ${
                      selectedChatId === chat.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <button
                      onClick={() => onSelectChat?.(chat.id)}
                      className="w-full px-3 py-2.5 text-left rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate">{chat.title}</p>
                            {chat.unread && chat.unread > 0 && (
                              <span className="flex-shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-xs font-medium text-background">
                                {chat.unread}
                              </span>
                            )}
                          </div>
                          {chat.lastMessage && (
                            <p className="text-xs text-muted-foreground truncate">
                              {chat.lastMessage}
                            </p>
                          )}
                        </div>
                        {chat.timestamp && (
                          <span className="flex-shrink-0 text-xs text-muted-foreground">
                            {formatTimestamp(chat.timestamp)}
                          </span>
                        )}
                      </div>
                    </button>
                    {onDeleteChat && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this chat?')) {
                            onDeleteChat(chat.id);
                          }
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
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
        </div>
      </div>
    </aside>
  );
}

