"use client";

import { Menu } from "lucide-react";

interface ChatHeaderProps {
  isSidebarOpen?: boolean;
  toggleSidebar?: () => void;
  progress?: number;
}

export default function ChatHeader({
  isSidebarOpen = true,
  toggleSidebar,
  progress = 0,
}: ChatHeaderProps) {
  return (
    <div className="border-b border-border bg-card px-4 py-3 h-[60px]">
      <div className="flex items-center justify-center relative">
        {!isSidebarOpen && toggleSidebar && (
          <button
            onClick={toggleSidebar}
            className="group absolute left-0 rounded-md p-2 hover:bg-accent transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5 text-foreground" />
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-sm opacity-0 shadow-md transition-opacity group-hover:opacity-100 pointer-events-none border border-border z-50">
              Open sidebar
            </span>
          </button>
        )}
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Progress</span>
            <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

