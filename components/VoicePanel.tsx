import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";

export default function VoicePanel() {
  return (
    <aside className="w-80 border-l border-border bg-card p-4">
      <div className="flex h-full flex-col">
        <h2 className="mb-4 text-lg font-semibold">Voice Settings</h2>
        
        <div className="space-y-6">
          {/* Microphone Section */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Microphone</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mic className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="mb-1 text-sm">Default Microphone</div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className="h-2 w-3/4 rounded-full bg-primary"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Speaker Section */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Speaker</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Volume2 className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="mb-1 text-sm">Default Speaker</div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className="h-2 w-2/3 rounded-full bg-secondary-foreground"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Voice Model Section */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Voice Model</h3>
            <div className="rounded-lg border border-border p-3">
              <div className="text-sm">Select a voice model</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Voice models will appear here
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

