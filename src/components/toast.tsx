"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/shell/icons";

// Minimal, dependency-free toast primitive — Odentia had no
// toast/snackbar/notification infrastructure anywhere in the codebase
// before this. Deliberately small: one context, one fixed-position
// live region, no queueing library, no animation framework. Mounted once
// at the root layout (src/app/layout.tsx) so every screen — both shells,
// AppShell and PortalShell — can call useToast() without its own provider.
//
// Non-blocking by construction: the outer region is
// `pointer-events-none`, only individual toast pills opt back into
// `pointer-events-auto`, so a toast never intercepts clicks on the page
// behind it. `role="status"`/`aria-live="polite"` announces new toasts to
// assistive tech without stealing focus.

export type ToastVariant = "success" | "error";
type ToastItem = { id: number; message: string; variant: ToastVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-tabbar-h,0px)+1rem)] z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg ${
              toast.variant === "success" ? "bg-success" : "bg-danger"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 opacity-80 hover:opacity-100"
            >
              <CloseIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
