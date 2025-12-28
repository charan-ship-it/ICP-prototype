import { Menu } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-4">
        <Menu className="h-5 w-5 text-foreground" />
        <h1 className="text-lg font-semibold">ICP Builder</h1>
      </div>
    </header>
  );
}

