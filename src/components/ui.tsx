"use client";

import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, CircleHelp, Hand, Loader2, XCircle } from "lucide-react";
import type { CheckStatus } from "@/lib/checker/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
        // Phones get 40–44px tap targets; desktop keeps the compact sizes.
        size === "sm" && "h-10 px-3.5 text-[14px] sm:h-8 sm:px-3 sm:text-[13px]",
        size === "md" && "h-12 px-4 text-[15px] sm:h-10 sm:text-sm",
        size === "lg" && "h-14 px-6 text-base",
        variant === "primary" && "bg-ink text-white shadow-sm hover:bg-black/85",
        variant === "secondary" && "border border-line-strong bg-white text-ink hover:border-ink/30 hover:bg-surface",
        variant === "ghost" && "text-muted hover:bg-surface hover:text-ink",
        variant === "danger" && "border border-taken-line bg-white text-taken hover:bg-taken-bg",
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors sm:h-8 sm:w-8",
        "hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className={cx("rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]", className)}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, icon, right }: { title: string; subtitle?: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

const STATUS_META: Record<CheckStatus | "checking", { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  available: { label: "Available", cls: "bg-avail-bg text-avail border-avail-line", Icon: CheckCircle2 },
  taken: { label: "Taken", cls: "bg-taken-bg text-taken border-taken-line", Icon: XCircle },
  unknown: { label: "Unknown", cls: "bg-unknown-bg text-unknown border-unknown-line", Icon: CircleHelp },
  checking: { label: "Checking", cls: "bg-surface text-muted border-line", Icon: Loader2 },
};

/**
 * Status pill. Manual results (the user looked at the profile and marked it) use
 * different wording ("Exists" / "Not found"), a hand icon and a dashed border so
 * they are never mistaken for automatic verification.
 */
export function StatusBadge({
  status,
  size = "sm",
  manual,
}: {
  status: CheckStatus | "checking";
  size?: "sm" | "lg";
  manual?: boolean;
}) {
  const m = STATUS_META[status];
  const isManual = manual && (status === "taken" || status === "available");
  const label = isManual ? (status === "taken" ? "Exists" : "Not found") : m.label;
  const Icon = isManual ? Hand : m.Icon;
  return (
    <span
      title={isManual ? "Checked by you on pump.fun (not automatically verified)" : undefined}
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold uppercase tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        isManual && "border-dashed",
        m.cls,
      )}
    >
      <Icon className={cx(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5", status === "checking" && "animate-spin")} aria-hidden />
      {label}
      {isManual && <span className="font-medium normal-case tracking-normal opacity-75">· you</span>}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  fill,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  /** Stretch to full width on phones (equal columns, count under the label). */
  fill?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "rounded-xl border border-line bg-surface p-1",
        fill ? "flex w-full sm:inline-flex sm:w-auto" : "inline-flex",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all sm:min-h-0",
            fill && "min-w-0 flex-1 flex-col gap-0.5 px-1 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3",
            value === o.value ? "bg-white text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx("rounded-md px-1.5 text-[11px] tabular-nums", value === o.value ? "bg-surface" : "bg-white/60")}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-ink">
        {label}
        {hint && <span className="text-[12px] font-normal text-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ---------- Toasts ---------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
      >
        {toasts.map((t) => (
          <div key={t.id} className="animate-toast rounded-xl bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
