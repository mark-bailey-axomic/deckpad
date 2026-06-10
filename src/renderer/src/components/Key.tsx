import { useEffect, useState, type DragEvent, type MouseEvent, type ReactElement } from 'react';
import { deriveLetters } from '@shared/buttons';
import type { Button, KeyRuntime } from '@shared/types';
import { fmtElapsed } from '@renderer/lib/format';
import { autoIconUrl, customIconUrl } from '@renderer/lib/icon-urls';
import { DeckIcon, type DeckIconName } from './DeckIcon';

export interface KeyProps {
  button: Button | null;
  runtime: KeyRuntime;
  now: number;
  accent: string;
  editMode: boolean;
  showLabels: boolean;
  pressed: boolean;
  dragOver: boolean;
  onPress: () => void;
  onStop: () => void;
  onContext: (e: MouseEvent) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
}

const TYPE_GLYPH: Record<Button['type'], DeckIconName> = { command: 'terminal', file: 'file', app: 'app' };

function KeyGlyph({ button, accent }: { button: Button; accent: string }): ReactElement {
  const { icon } = button;
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [button.id, icon.kind, icon.sourcePath, button.path]);
  const letters = deriveLetters(button.label);

  if (icon.kind === 'letter' || imgFailed) {
    return <span className="dp-key-letter" style={{ background: icon.tileColor || accent }}>{letters}</span>;
  }
  if (icon.kind === 'emoji') return <span className="dp-key-emoji">{icon.emoji || '🚀'}</span>;
  if (icon.kind === 'image' && icon.sourcePath) {
    return <img className="dp-key-img" src={customIconUrl(button.id, icon.sourcePath)} alt=""
      width={30} height={30} onError={() => setImgFailed(true)} />;
  }
  // kind === 'auto': real OS icon for file/app paths, terminal/type glyph for commands
  if ((button.type === 'file' || button.type === 'app') && button.path) {
    return <img className="dp-key-img" src={autoIconUrl(button.id)} alt=""
      width={30} height={30} onError={() => setImgFailed(true)} />;
  }
  return <DeckIcon name={TYPE_GLYPH[button.type]} size={30} />;
}

export function Key(props: KeyProps): ReactElement {
  const { button, runtime, now, accent, editMode, showLabels, pressed, dragOver,
    onPress, onStop, onContext, onDelete, onDragStart, onDragOver, onDrop } = props;

  // empty slot
  if (!button) {
    return (
      <button className="dp-key dp-key--empty" onClick={onPress} onContextMenu={(e) => e.preventDefault()}
        onDragOver={onDragOver} onDrop={onDrop}>
        <span className="dp-empty-plus"><DeckIcon name="plus" size={22} /></span>
      </button>
    );
  }

  const st = runtime.state;
  const elapsed = st === 'running' && runtime.startedAt ? Math.max(0, (now - runtime.startedAt) / 1000) : 0;

  return (
    <button
      className={[
        'dp-key', 'dp-key--filled', `is-${st}`,
        pressed ? 'is-pressed' : '', editMode ? 'is-edit' : '', dragOver ? 'is-dragover' : '',
      ].join(' ')}
      style={{ '--accent': accent } as React.CSSProperties}
      draggable={editMode}
      onClick={onPress}
      onContextMenu={onContext}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="dp-key-inner">
        {/* status dot (running) / fail dot */}
        {st === 'running' && <span className="dp-key-status" style={{ background: accent }} />}
        {runtime.failedDot && st !== 'running' && <span className="dp-key-faildot" />}

        <span className="dp-key-glyph">
          <KeyGlyph button={button} accent={accent} />
        </span>

        {showLabels && (
          <span className="dp-key-label">
            {st === 'running'
              ? <span className="dp-key-timer">▶ {fmtElapsed(elapsed)}</span>
              : button.label}
          </span>
        )}

        {/* stop overlay (running, on hover) */}
        {st === 'running' && (
          <span className="dp-key-stop" onClick={(e) => { e.stopPropagation(); onStop(); }} role="button" aria-label="Stop">
            <DeckIcon name="stop" size={22} />
          </span>
        )}

        {/* launching shimmer */}
        {st === 'launching' && <span className="dp-key-shimmer" />}
      </span>

      {/* edit-mode delete badge */}
      {editMode && (
        <span className="dp-key-del" onClick={(e) => { e.stopPropagation(); onDelete(); }} role="button" aria-label="Delete">
          <DeckIcon name="close" size={12} />
        </span>
      )}
    </button>
  );
}
