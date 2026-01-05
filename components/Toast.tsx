"use client";

import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "error" | "success" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function ToastComponent({ toast, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after duration (default 5 seconds)
    const duration = toast.duration || 5000;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(toast.id), 300); // Wait for fade-out
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const icons = {
    error: AlertCircle,
    success: CheckCircle,
    info: Info,
    warning: AlertTriangle,
  };

  const styles = {
    error: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
    success: "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
  };

  const Icon = icons[toast.type];

  return (
    <div
      className={`
        fixed top-4 right-4 z-50 max-w-md w-full
        rounded-lg border px-4 py-3 shadow-lg
        backdrop-blur-sm
        transition-all duration-300 ease-in-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
        ${styles[toast.type]}
      `}
    >
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <p className="flex-1 text-sm font-medium leading-relaxed">{toast.message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onDismiss(toast.id), 300);
          }}
          className="flex-shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastComponent toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

