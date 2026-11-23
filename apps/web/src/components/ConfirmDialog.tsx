import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Sembunyikan tombol batal (untuk dialog detail tanpa keputusan). */
  hideCancel?: boolean;
  /** Dialog lebar (max-w-2xl) untuk form panjang ber-kolom, mis. Tambah Pengguna. */
  wide?: boolean;
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Kurva ease-out kuat untuk UI — konsisten dengan token CSS --ease-out-strong. */
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Accessible modal dialog: focus trap, Esc closes, focus restored on close. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  hideCancel = false,
  wide = false,
  danger = false,
  busy = false,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  // Handlers are read through refs so the focus-trap effect only runs when the
  // dialog opens/closes. Callers pass inline closures; if they were effect deps,
  // every parent re-render (each keystroke) would re-run focus() and steal
  // focus from the field being typed into.
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="confirm-dialog-root"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className={`w-full rounded-xl bg-white p-5 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
          >
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
            {children}
            <div className="mt-4 flex justify-end gap-2">
              {hideCancel ? null : (
                <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                className={danger ? 'btn-danger' : 'btn-primary'}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? 'Memproses…' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function useConfirmState() {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  return { open, show, hide };
}
