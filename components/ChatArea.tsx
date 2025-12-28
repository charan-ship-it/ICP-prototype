import { MessageCircle } from "lucide-react";

export default function ChatArea() {
  return (
    <div className="flex flex-1 items-center justify-center bg-background p-8">
      <div className="text-center">
        <MessageCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          Start a conversation by typing a message below
        </p>
      </div>
    </div>
  );
}

