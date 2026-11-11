"use client";

// Shared building blocks: dropdown menu, modal dialog, confirm dialog and toast message.
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";

export type MenuItem = { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; hint?: string } | "divider";

/** A button that opens a small menu. Closes on outside click or Escape. */
export function Menu({
  trigger,
  items,
  align = "right",
  direction = "down",
  triggerClassName,
  label,
}: {
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  direction?: "up" | "down";
  triggerClassName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`pop-in absolute z-50 min-w-48 rounded-xl border border-line bg-elev p-1 shadow-xl shadow-black/10 dark:shadow-black/50 ${
            align === "right" ? "right-0" : "left-0"
          } ${direction === "down" ? "top-full mt-1" : "bottom-full mb-1"}`}
        >
          {items.map((item, i) =>
            item === "divider" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-hover ${
                  item.danger ? "text-red-500" : "text-fg"
                }`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-faint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Centered dialog with a dimmed background. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`pop-in w-full overflow-hidden rounded-2xl border border-line bg-elev shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted transition hover:bg-hover hover:text-fg">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="px-5 py-4 text-sm leading-relaxed text-fg-soft">{message}</p>
      <div className="flex justify-end gap-2 px-5 pb-5">
        <button onClick={onCancel} className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:bg-hover">
          Cancel
        </button>
        <button onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toast({ message, tone }: { message: string; tone: "info" | "error" }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div
        className={`pop-in rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
          tone === "error" ? "bg-red-600 text-white" : "bg-btn text-btn-fg"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
