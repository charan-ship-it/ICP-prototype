"use client";

import { X, Download, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ICPDocumentViewerProps {
  document: string;
  chatId: string;
  onClose: () => void;
}

export default function ICPDocumentViewer({ document, chatId, onClose }: ICPDocumentViewerProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(document);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Create a text file download
      const blob = new Blob([document], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      // Use window.document to avoid conflict with the 'document' prop
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `ICP-Document-${Date.now()}.txt`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-background rounded-lg shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">Your ICP Document</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Downloading...' : 'Download'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="prose prose-sm max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-muted/30 p-6 rounded-lg">
              {document}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

