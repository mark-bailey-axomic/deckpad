import { useEffect, useRef, type ReactElement } from 'react';
import type { Button } from '@shared/types';
import { fmtElapsed } from '../lib/format';
import { DeckIcon } from './DeckIcon';

export interface ActivityItem {
  button: Button;
  groupName: string;
  state: 'running' | 'failed';
  startedAt?: number; // running
  log: string[];
  exit?: number;      // failed
  ranFor?: number;    // failed, ms
}

export interface ActivityPanelProps {
  open: boolean;
  items: ActivityItem[];
  now: number;
  accent: string;
  onStop: (buttonId: string) => void;
  onClose: () => void;
}

export function ActivityPanel({ open, items, now, accent, onStop, onClose }: ActivityPanelProps): ReactElement {
  const scrollRefs = useRef<Record<string, HTMLPreElement | null>>({});

  useEffect(() => {
    Object.values(scrollRefs.current).forEach((el) => {
      if (el) el.scrollTop = el.scrollHeight;
    });
  });

  return (
    <div className={'dp-panel' + (open ? ' is-open' : '')}>
      <div className="dp-panel-head">
        <div className="dp-panel-title">Activity</div>
        <button className="dp-icon-btn" onClick={onClose} aria-label="Close">
          <DeckIcon name="chevronDown" size={18} />
        </button>
      </div>
      <div className="dp-panel-list">
        {items.length === 0 && (
          <div className="dp-panel-empty">Nothing running. Press a key to launch an action.</div>
        )}
        {items.map((it) => {
          const failed = it.state === 'failed';
          const elapsed = failed
            ? (it.ranFor ?? 0) / 1000
            : Math.max(0, (now - (it.startedAt ?? now)) / 1000);
          const iconName = it.button.type === 'file' ? 'file' : it.button.type === 'app' ? 'app' : 'terminal';

          return (
            <div className="dp-act" key={it.button.id}>
              <div className="dp-act-top">
                <span
                  className={'dp-act-icon' + (failed ? ' is-failed' : '')}
                  style={!failed ? { color: accent } : undefined}
                >
                  <DeckIcon name={iconName} size={18} />
                </span>
                <div className="dp-act-meta">
                  <div className="dp-act-label">
                    {it.button.label}
                    <span className="dp-act-group">{it.groupName}</span>
                  </div>
                  <div className="dp-act-sub">
                    {failed ? (
                      <span className="dp-act-failtag">
                        Failed · exit {it.exit} · ran {fmtElapsed(elapsed)}
                      </span>
                    ) : (
                      <span className="dp-act-time">
                        <span className="dp-run-dot" style={{ background: accent }} />{' '}
                        {fmtElapsed(elapsed)}
                      </span>
                    )}
                  </div>
                </div>
                {failed ? (
                  <span className="dp-act-cmd">{it.button.command}</span>
                ) : (
                  <button className="dp-stop-btn" onClick={() => onStop(it.button.id)}>
                    <DeckIcon name="stop" size={11} /> Stop
                  </button>
                )}
              </div>
              <pre
                className="dp-act-log"
                ref={(el) => { scrollRefs.current[it.button.id] = el; }}
              >
                {it.log.join('\n')}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
