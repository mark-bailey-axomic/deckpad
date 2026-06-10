import type { ReactElement } from 'react';
import { DeckIcon } from './DeckIcon';

export type ToastState =
  | { kind: 'fail'; buttonId: string; label: string; exit: number }
  | { kind: 'info'; message: string };

export interface ToastProps {
  toast: ToastState | null;
  onView: () => void;
  onClose: () => void;
}

export function Toast({ toast, onView, onClose }: ToastProps): ReactElement | null {
  if (!toast) return null;
  return (
    <div className="dp-toast" role="status">
      <span className="dp-toast-dot" />
      <div className="dp-toast-body">
        {toast.kind === 'fail' ? (
          <>
            <div className="dp-toast-title">
              {toast.label} failed <span className="dp-toast-exit">(exit {toast.exit})</span>
            </div>
            <button className="dp-toast-link" onClick={onView}>View log</button>
          </>
        ) : (
          <div className="dp-toast-title">{toast.message}</div>
        )}
      </div>
      <button className="dp-toast-x" onClick={onClose} aria-label="Dismiss">
        <DeckIcon name="close" size={14} />
      </button>
    </div>
  );
}
