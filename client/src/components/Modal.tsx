import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";

export interface ModalProps {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Lab 3 (ui-spec §1.8): a side panel for create/edit forms instead of a centred dialog. */
  variant?: "dialog" | "panel";
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// The modals open right now, innermost last. Only the innermost one answers
// Escape and Tab, so a confirmation opened inside a side panel closes on its
// own and leaves the panel open (Lab 3, Issue 10, RESP-06).
const openModals: HTMLElement[] = [];

// ui-spec.md §7 (Lab 3 §1.8, §10): traps focus while open, closes on Escape,
// gives focus back to whatever had it when it opened (the button that opened
// it), and clicking outside does nothing (§6.5 — a destructive action's
// confirmation should never be dismissible by an accidental stray click).
export function Modal({ titleId, onClose, children, variant = "dialog" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The latest onClose, so callers can pass an inline function without the
  // effect below re-running — and re-focusing the first control — on every render.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openModals.push(dialog);

    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (openModals[openModals.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        onCloseRef.current();
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      openModals.splice(openModals.indexOf(dialog), 1);
      // Back to the opener, if it is still on the page (a row that reloaded
      // may have replaced it).
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className={"zg-modal-backdrop" + (variant === "panel" ? " zg-modal-backdrop--panel" : "")}>
      <div className={"zg-modal" + (variant === "panel" ? " zg-side-panel" : "")} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        {children}
      </div>
    </div>
  );
}
