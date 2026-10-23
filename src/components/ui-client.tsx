"use client";

// Interactive primitives standing in for TasksBook's Radix/shadcn ones (Dialog, ToggleGroup, Switch, ConfirmDialog).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Centered dialog; full screen on phones. Esc and the backdrop call `onClose`. */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  labelledBy = "modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Portals need document.body: render after mount (a dialog can be open on first render, e.g. ?task= deep links).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !mounted) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Respect an autoFocus field inside the dialog; otherwise focus the dialog itself.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog on top handles its own Escape.
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;
  // Portal: <main> animates with a transform, which would trap `position: fixed` inside it.
  return createPortal(
    // Phones: bottom sheet (rounded top, above the home indicator). Tablet and up: centred dialog.
    <div className="fixed inset-0 z-50 flex items-end justify-center pt-[max(1rem,env(safe-area-inset-top))] sm:items-center sm:p-3">
      <div className="absolute inset-0 bg-black/50" onClick={() => onCloseRef.current()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          "animate-sheet-in relative flex max-h-full w-full flex-col overflow-hidden rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-elegant outline-none sm:animate-none sm:rounded-2xl sm:border sm:pb-0",
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b px-5 py-3.5 pr-12">
          <h2 id={labelledBy} className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className={buttonClass("ghost", "icon", "absolute right-3 top-2.5 h-8 w-8 text-muted-foreground")}
            aria-label="Close"
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Single-choice segmented control (TasksBook's ToggleGroup look). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: "default" | "sm";
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "default";
}

/** `const { confirm, dialog } = useConfirm()` — render `dialog`, then `if (await confirm({...}))`. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const done = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const dialog = state
    ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), done(false))}>
          <div className="absolute inset-0 bg-black/50" onClick={() => done(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-sm rounded-2xl border bg-card p-5 shadow-elegant">
            <h2 id="confirm-title" className="text-base font-semibold">
              {state.title}
            </h2>
            {state.description && <p className="mt-1.5 text-sm text-muted-foreground">{state.description}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={buttonClass("outline")} onClick={() => done(false)}>
                Cancel
              </button>
              <button type="button" autoFocus className={buttonClass(state.tone === "danger" ? "destructive" : "default")} onClick={() => done(true)}>
                {state.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
  return { confirm, dialog };
}

export interface MenuItem {
  label: React.ReactNode;
  icon?: React.ElementType;
  onSelect: () => void;
  tone?: "danger";
  /** Draws a divider above this item. */
  separator?: boolean;
}

/** Dropdown menu rendered in a portal (so tables with overflow don't clip it). */
export function Menu({
  trigger,
  items,
  align = "end",
  label,
  header,
  width = "w-52",
}: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  label?: string;
  header?: React.ReactNode;
  width?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "mousedown" && panel.current?.contains(e.target as Node)) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 4 });
  };

  // Open upwards when there is no room below.
  const up = pos ? pos.top > window.innerHeight - 260 : false;
  return (
    <>
      {trigger({ onClick, "aria-expanded": !!pos, "aria-haspopup": "menu" })}
      {pos &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            style={{ ...(up ? { bottom: pos.bottom } : { top: pos.top }), ...(align === "end" ? { right: pos.right } : { left: pos.left }) }}
            className={cn("fixed z-[70] max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-elegant", width)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const list = [...(panel.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
              const i = list.indexOf(document.activeElement as HTMLElement);
              list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
            }}
          >
            {header}
            {items.map((it, i) => (
              <div key={i}>
                {it.separator && <div className="my-1 h-px bg-border" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPos(null);
                    it.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                    it.tone === "danger" && "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10",
                  )}
                >
                  {it.icon && <it.icon className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1">{it.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Native select styled like the rest of the UI. */
export function SelectBox({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/**
 * Panel anchored to a trigger, rendered in a portal with fixed positioning so scrolling
 * containers (dialogs, tables) don't clip it. Flips above the trigger when there's no room below.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = "start",
  className,
  label,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const h = panel.current?.offsetHeight ?? 360;
      const below = window.innerHeight - r.bottom;
      const up = below < h + 12 && r.top > below;
      const style: React.CSSProperties = up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 };
      if (align === "end") style.right = Math.max(8, window.innerWidth - r.right);
      else style.left = Math.max(8, Math.min(r.left, window.innerWidth - (panel.current?.offsetWidth ?? 0) - 8));
      setPos(style);
    };
    place();
    const raf = requestAnimationFrame(place); // re-place once the panel has a real size
    const close = (e: Event) => {
      if (e.type === "keydown") {
        if ((e as KeyboardEvent).key !== "Escape") return;
        e.stopPropagation();
      }
      const t = e.target as Node;
      if (e.type === "mousedown" && (panel.current?.contains(t) || anchor.current?.contains(t))) return;
      onCloseRef.current();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, align]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={pos ?? { top: -9999, left: -9999 }}
      className={cn("fixed z-[70] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border bg-popover shadow-elegant", className)}
    >
      {children}
    </div>,
    document.body,
  );
}
