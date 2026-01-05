"use client";

import { Pencil, Search, MessageSquare, X, Trash2, Plus, MoreVertical } from "lucide-react";
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
  onEditChat?: (chatId: string, newTitle: string) => void;
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
  onEditChat,
  onDeleteAllChats,
  selectedChatId,
}: SidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    if (editingChatId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChatId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openMenuId]);

  const filteredChats = chats.filter(
    (chat) =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditClick = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
    setOpenMenuId(null);
  };

  const handleSaveEdit = (chatId: string) => {
    if (editTitle.trim() && onEditChat) {
      onEditChat(chatId, editTitle.trim());
    }
    setEditingChatId(null);
    setEditTitle("");
  };

  const handleCancelEdit = () => {
    setEditingChatId(null);
    setEditTitle("");
  };

  const handleDeleteClick = (chatId: string) => {
    setOpenMenuId(null);
    if (onDeleteChat && confirm('Delete this chat?')) {
      onDeleteChat(chatId);
    }
  };

  return (
    <aside className="w-64 min-w-[256px] max-w-[80vw] border-r border-border bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <img 
            src="/AI Xccelerate logo.png" 
            alt="AI Xccelerate Logo" 
            className="h-7 w-auto"
          />
        </div>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Close sidebar"
        >
          <img
            src="/sidebar-close.svg"
            alt="Close sidebar"
            className="h-4 w-4 text-muted-foreground"
          />
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
                {editingChatId === chat.id ? (
                  <div className="px-3 py-2.5">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit(chat.id);
                        } else if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                      }}
                      onBlur={() => handleSaveEdit(chat.id)}
                      className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ) : (
                  <>
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
                          {chat.unread && chat.unread > 0 && (
                            <span className="flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary px-1.5 text-xs font-medium text-white">
                              {chat.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    {(onDeleteChat || onEditChat) && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all" ref={menuRef}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === chat.id ? null : chat.id);
                          }}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          aria-label="More options"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {openMenuId === chat.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-background border border-border rounded-md shadow-lg z-10">
                            {onEditChat && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditClick(chat);
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                            )}
                            {onDeleteChat && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(chat.id);
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
