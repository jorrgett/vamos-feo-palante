"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { createContext, use, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { avatarText, isPhoto } from "@/lib/avatar";

export function Avatar({
  emoji,
  color,
  size = 36,
  className,
  title,
  ghost,
}: {
  emoji: string;
  color: string;
  size?: number;
  className?: string;
  title?: string;
  ghost?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      title={title}
      className={clsx("relative inline-grid shrink-0 place-items-center rounded-full select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${color} 55%, white), ${color})`,
        boxShadow: `0 0 0 2px var(--card), 0 6px 16px -6px ${color}`,
        opacity: ghost ? 0.85 : 1,
      }}
    >
      {isPhoto(emoji) && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={emoji} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className="size-full rounded-full object-cover" />
      ) : (
        <span aria-hidden className="leading-none">
          {avatarText(emoji)}
        </span>
      )}
      {ghost && (
        <span className="absolute -right-0.5 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-card text-[8px] ring-2 ring-card" title="Sin cuenta todavía">
          👻
        </span>
      )}
    </span>
  );
}

export function AvatarStack({ people, size = 28, max = 5 }: { people: { emoji: string; color: string; name: string }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <Avatar key={i} emoji={p.emoji} color={p.color} size={size} title={p.name} className={i ? "-ml-2" : ""} />
      ))}
      {extra > 0 && (
        <span className="-ml-2 grid place-items-center rounded-full bg-card-2 text-[11px] font-bold text-muted ring-2 ring-card" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "relative inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:pointer-events-none disabled:opacity-50",
        variant !== "primary" && "active:scale-[0.97]",
        size === "sm" && "h-9 px-3.5 text-sm",
        size === "md" && "h-11 px-5 text-[0.95rem]",
        size === "lg" && "h-14 px-7 text-base",
        variant === "primary" && "btn-pop",
        variant === "dark" && "bg-text text-bg hover:opacity-90",
        variant === "soft" && "border border-line bg-card-2 text-text hover:border-line-strong",
        variant === "ghost" && "text-muted hover:bg-card-2 hover:text-text",
        variant === "danger" && "bg-rose-soft text-rose hover:bg-rose hover:text-on-color",
        className,
      )}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  name: string;
}) {
  return (
    <div className={clsx("relative flex gap-1 rounded-2xl border border-line bg-card-2 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "relative z-10 flex-1 rounded-xl font-semibold whitespace-nowrap transition-colors",
            size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
            value === o.value ? "text-text" : "text-muted hover:text-text",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${name}`}
              className="absolute inset-0 -z-10 rounded-xl border border-line-strong bg-card shadow-sm"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Hoja inferior en móvil, modal centrado en escritorio. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={clsx(
              "safe-bottom-sheet relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[1.75rem] border border-line bg-card p-5 shadow-2xl sm:rounded-[1.75rem] sm:pb-6",
              wide ? "sm:max-w-2xl" : "sm:max-w-md",
            )}
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="display text-xl font-bold">{title}</h2>
              <button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-card-2 text-muted hover:text-text" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -30, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.95 }}
              className={clsx(
                "pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-md",
                t.tone === "ok" && "border-mint/30 bg-card/95 text-text",
                t.tone === "error" && "border-rose/40 bg-card/95 text-rose",
                t.tone === "info" && "border-line bg-card/95 text-text",
              )}
            >
              {t.tone === "ok" ? "✅ " : t.tone === "error" ? "⚠️ " : ""}
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx>
  );
}

export const useToast = () => use(ToastCtx);

export function EmptyState({ emoji, title, children, action }: { emoji: string; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <motion.div
        className="text-5xl"
        animate={{ rotate: [0, -8, 8, -4, 0], y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 2 }}
      >
        {emoji}
      </motion.div>
      <h3 className="display text-xl font-bold">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
