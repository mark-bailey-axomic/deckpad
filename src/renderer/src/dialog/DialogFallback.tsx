import type { ReactElement } from 'react';

/** Frameless dialog windows have no OS chrome, so any fallback must offer its own way out. */
export function DialogFallback({ message }: { message: string }): ReactElement {
  return (
    <div className="dp-dialog-window" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <p style={{ margin: 0 }}>{message}</p>
      <button className="dp-btn dp-btn--ghost" onClick={() => window.close()}>Close</button>
    </div>
  );
}
