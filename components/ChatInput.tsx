import { Send, Paperclip } from "lucide-react";

export default function ChatInput() {
  return (
    <div className="border-t border-border bg-card p-4">
      <div className="mx-auto flex max-w-4xl items-end gap-2">
        <button className="rounded-lg p-2 hover:bg-accent">
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1 rounded-lg border border-input bg-background px-4 py-3">
          <textarea
            placeholder="Type your message..."
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            rows={1}
          />
        </div>
        <button className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90">
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

