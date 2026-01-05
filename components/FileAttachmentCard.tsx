"use client";

import { X, FileText, Loader2 } from "lucide-react";

interface FileAttachmentCardProps {
  file: File;
  onRemove: () => void;
  status?: 'pending' | 'done';
}

export default function FileAttachmentCard({ file, onRemove, status = 'pending' }: FileAttachmentCardProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const truncateFileName = (name: string, maxLength: number = 30): string => {
    if (name.length <= maxLength) return name;
    const extension = name.split('.').pop();
    const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.substring(0, maxLength - extension!.length - 4);
    return `${truncated}...${extension}`;
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'done': return 'Processed';
      default: return '';
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2 text-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-foreground">
            {truncateFileName(file.name)}
          </p>
          {status !== 'pending' && (
            <span className="text-xs text-muted-foreground">
              {getStatusText()}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>
      </div>
      {status === 'pending' ? (
        <button
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-destructive/10 transition-colors"
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

