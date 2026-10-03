import { ReactNode, useEffect, useRef } from "react";

export interface ModalProps {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Lab 3 (ui-spec §1.8): a side panel for create/edit forms instead of a centred dialog. */
  variant?: "dialog" | "panel";
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// ui-spec.md §7: traps focus while open, returns focus to the triggering
// button on close (the caller does the returning — it's the one that knows
// which button opened this), and clicking outside does nothing (§6.5 — a
// destructive action's confirmation should never be dismissible by an
// accidental stray click).
export function Modal({ titleId, onClose, children, variant = "dialog" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={"zg-modal-backdrop" + (variant === "panel" ? " zg-modal-backdrop--panel" : "")}>
      <div className={"zg-modal" + (variant === "panel" ? " zg-side-panel" : "")} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        {children}
      </div>
    </div>
  );
}
