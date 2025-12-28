import { MessageSquare, History, Settings } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="w-64 border-r border-border bg-card">
      <div className="flex h-full flex-col p-4">
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Conversations
          </h2>
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-md p-2 hover:bg-accent">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">New Chat</span>
            </div>
          </div>
        </div>
        
        <div className="mb-4 flex-1 overflow-y-auto">
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-md p-2 text-sm text-muted-foreground hover:bg-accent">
              <History className="h-4 w-4" />
              <span>Chat History</span>
            </div>
          </div>
        </div>
        
        <div className="border-t border-border pt-4">
          <div className="flex items-center gap-2 rounded-md p-2 hover:bg-accent">
            <Settings className="h-4 w-4" />
            <span className="text-sm">Settings</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

