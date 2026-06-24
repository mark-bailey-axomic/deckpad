import { useEffect, useState, type KeyboardEvent, type ReactElement } from 'react';
import type { Button, PickKind, ScriptLanguage } from '@shared/types';
import { EMOJIS, TILE_COLORS } from '@shared/constants';
import { deriveLetters } from '@shared/buttons';
import { DeckIcon } from './DeckIcon';
import { ToggleRow } from './ToggleRow';

export interface ModalDraft extends Button {
  isNew: boolean;
}

export function newDraft(): ModalDraft {
  return {
    id: crypto.randomUUID(),
    isNew: true,
    label: '',
    type: 'command',
    command: '',
    cwd: '',
    showTerminal: false,
    script: '',
    language: 'sh',
    icon: { kind: 'auto' }
  };
}

export interface EditModalProps {
  open: boolean;
  draft: ModalDraft | null;
  accent: string;
  onSave: (button: Button) => void;
  onCancel: () => void;
  pickFile: (kind: PickKind) => Promise<string | null>;
}

const TYPE_LABELS: Record<Button['type'], string> = {
  command: 'Run command',
  script: 'Add script'
};

const LANG_LABELS: Record<ScriptLanguage, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sh: 'SH'
};

export function EditModal(props: EditModalProps): ReactElement | null {
  const { open, accent, onSave, onCancel, pickFile } = props;
  const [d, setD] = useState<ModalDraft | null>(props.draft);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setD(props.draft);
      setEmojiOpen(false);
    }
  }, [open, props.draft]);

  if (!open || !d) return null;

  const set = (patch: Partial<ModalDraft>): void => setD((p) => (p ? { ...p, ...patch } : p));

  const handleChooseImage = async (): Promise<void> => {
    const p = await pickFile('image');
    if (p) set({ icon: { ...d.icon, kind: 'image', sourcePath: p } });
  };

  const handlePickEmoji = (): void => {
    set({ icon: { ...d.icon, kind: 'emoji', emoji: d.icon.emoji ?? '🚀' } });
    setEmojiOpen((o) => !o);
  };

  const handleLetterTile = (): void => {
    set({ icon: { ...d.icon, kind: 'letter', tileColor: d.icon.tileColor ?? accent } });
  };

  const handleTypeChange = (type: Button['type']): void => {
    set({ type, language: type === 'script' ? (d.language ?? 'sh') : d.language });
  };

  const handleScriptKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const body = d.script ?? '';
    set({ script: body.slice(0, start) + '  ' + body.slice(end) });
    // Restore the caret after React re-renders the controlled value.
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2;
    });
  };

  const handleSave = (): void => {
    const { isNew: _isNew, ...button } = d;
    // Drop fields that don't apply to the chosen type so stale values never persist.
    if (button.type === 'command') {
      delete button.script;
      delete button.language;
    } else {
      delete button.command;
      delete button.showTerminal;
    }
    onSave(button);
  };

  const previewTile = (): ReactElement => {
    const k = d.icon.kind;
    if (k === 'letter') {
      return (
        <div className="dp-prev-tile" style={{ background: d.icon.tileColor ?? accent }}>
          <span className="dp-prev-letter">{deriveLetters(d.label || '?').charAt(0)}</span>
        </div>
      );
    }
    if (k === 'emoji') {
      return (
        <div className="dp-prev-tile dp-prev-tile--key">
          <span className="dp-prev-emoji">{d.icon.emoji ?? '🚀'}</span>
        </div>
      );
    }
    if (k === 'image') {
      return (
        <div className="dp-prev-tile" style={{ background: 'linear-gradient(135deg,#3b3b42,#23232a)' }}>
          <DeckIcon name="image" size={26} style={{ color: '#A3A3AD' }} />
        </div>
      );
    }
    return (
      <div className="dp-prev-tile dp-prev-tile--key" style={{ color: accent }}>
        <DeckIcon name="terminal" size={28} />
      </div>
    );
  };

  const isCommand = d.type === 'command';
  const scriptEmpty = !(d.script ?? '').trim();

  return (
    <div className="dp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dp-modal" role="dialog" aria-modal="true">
        <div className="dp-modal-head">
          <div className="dp-modal-title">{d.isNew ? 'Add action' : 'Edit action'}</div>
          <button className="dp-icon-btn" onClick={onCancel} aria-label="Close">
            <DeckIcon name="close" size={18} />
          </button>
        </div>

        <div className="dp-modal-body">
          {/* Label */}
          <div className="dp-field">
            <label className="dp-field-label">Label</label>
            <input
              className="dp-input"
              value={d.label}
              placeholder="e.g. Dev Server"
              onChange={(e) => set({ label: e.target.value })}
              autoFocus
            />
          </div>

          {/* Action type */}
          <div className="dp-field">
            <label className="dp-field-label">Action type</label>
            <div className="dp-seg">
              {(['command', 'script'] as const).map((v) => (
                <button
                  key={v}
                  className={'dp-seg-btn' + (d.type === v ? ' is-on' : '')}
                  onClick={() => handleTypeChange(v)}
                >
                  {TYPE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>

          {/* Command fields */}
          {isCommand ? (
            <>
              <div className="dp-field">
                <label className="dp-field-label">Command</label>
                <textarea
                  className="dp-input dp-mono dp-textarea"
                  rows={2}
                  spellCheck={false}
                  value={d.command ?? ''}
                  placeholder="npm run dev"
                  onChange={(e) => set({ command: e.target.value })}
                />
              </div>
              <div className="dp-field">
                <label className="dp-field-label">
                  Working directory <span className="dp-opt">optional</span>
                </label>
                <input
                  className="dp-input dp-mono"
                  value={d.cwd ?? ''}
                  placeholder="~/dev/acme-web"
                  onChange={(e) => set({ cwd: e.target.value })}
                />
              </div>
              <ToggleRow
                label="Show terminal window"
                value={!!d.showTerminal}
                onChange={(v) => set({ showTerminal: v })}
              />
            </>
          ) : (
            <>
              <div className="dp-field">
                <label className="dp-field-label">Language</label>
                <div className="dp-seg">
                  {(['javascript', 'typescript', 'python', 'sh'] as const).map((v) => (
                    <button
                      key={v}
                      className={'dp-seg-btn' + ((d.language ?? 'sh') === v ? ' is-on' : '')}
                      onClick={() => set({ language: v })}
                    >
                      {LANG_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dp-field">
                <label className="dp-field-label">Script</label>
                <textarea
                  className="dp-input dp-mono dp-textarea"
                  rows={8}
                  spellCheck={false}
                  value={d.script ?? ''}
                  placeholder="Write your script here…"
                  onChange={(e) => set({ script: e.target.value })}
                  onKeyDown={handleScriptKeyDown}
                />
              </div>
              <div className="dp-field">
                <label className="dp-field-label">
                  Working directory <span className="dp-opt">optional</span>
                </label>
                <input
                  className="dp-input dp-mono"
                  value={d.cwd ?? ''}
                  placeholder="~/dev/acme-web"
                  onChange={(e) => set({ cwd: e.target.value })}
                />
              </div>
            </>
          )}

          {/* Icon section */}
          <div className="dp-field">
            <label className="dp-field-label">Icon</label>
            <div className="dp-icon-section">
              <div className="dp-prev-wrap">{previewTile()}</div>
              <div className="dp-icon-controls">
                <div className="dp-icon-btns">
                  <button
                    className={'dp-mini-btn' + (d.icon.kind === 'image' ? ' is-on' : '')}
                    onClick={handleChooseImage}
                  >
                    <DeckIcon name="image" size={15} /> Choose image…
                  </button>
                  <button
                    className={'dp-mini-btn' + (d.icon.kind === 'emoji' ? ' is-on' : '')}
                    onClick={handlePickEmoji}
                  >
                    <DeckIcon name="smile" size={15} /> Pick emoji
                  </button>
                  <button
                    className={'dp-mini-btn' + (d.icon.kind === 'letter' ? ' is-on' : '')}
                    onClick={handleLetterTile}
                  >
                    <DeckIcon name="type" size={15} /> Letter tile
                  </button>
                </div>

                {emojiOpen && d.icon.kind === 'emoji' && (
                  <div className="dp-emoji-grid">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        className={'dp-emoji-cell' + (d.icon.emoji === e ? ' is-on' : '')}
                        onClick={() => set({ icon: { ...d.icon, emoji: e } })}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                {(d.icon.kind === 'letter' || d.icon.kind === 'emoji') && (
                  <div className="dp-swatches dp-swatches--sm">
                    {TILE_COLORS.map((c) => (
                      <button
                        key={c}
                        className={'dp-swatch dp-swatch--sm' + (d.icon.tileColor === c ? ' is-on' : '')}
                        style={{ background: c }}
                        onClick={() => set({ icon: { ...d.icon, tileColor: c } })}
                        aria-label={c}
                      >
                        {d.icon.tileColor === c && <DeckIcon name="check" size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dp-modal-foot">
          <button className="dp-btn dp-btn--ghost" onClick={onCancel}>Cancel</button>
          <button
            className="dp-btn dp-btn--primary"
            style={{ background: accent }}
            disabled={!d.label.trim() || (d.type === 'script' && scriptEmpty)}
            onClick={handleSave}
          >
            Save action
          </button>
        </div>
      </div>
    </div>
  );
}
