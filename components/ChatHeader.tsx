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
    <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-6 py-4">
        <div className="flex items-center justify-center relative">
          {!isSidebarOpen && toggleSidebar && (
            <button
              onClick={toggleSidebar}
              className="absolute left-0 rounded-lg p-2 hover:bg-muted transition-colors"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
          )}
          
          <div className="w-full max-w-3xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">ICP Progress</span>
              <span className="text-xs font-semibold text-foreground tabular-nums">{progress}%</span>
            </div>
            <div className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary to-primary/90 h-1.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
