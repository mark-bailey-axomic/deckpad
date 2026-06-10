import { useEffect, useState, type ReactElement } from 'react';
import type { Button, PickKind } from '@shared/types';
import { EMOJIS, TILE_COLORS } from '@shared/constants';
import { deriveLetters } from '@shared/buttons';
import { DeckIcon } from './DeckIcon';
import { ToggleRow } from './ToggleRow';

export interface ModalDraft extends Button {
  isNew: boolean;
  /** Basename shown in the "Auto from file" badge after a successful pick. */
  autoFrom?: string;
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
    path: '',
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
  extractIcon: (path: string, buttonId: string) => Promise<string | null>;
}

function basename(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).at(-1) ?? p;
}

export function EditModal(props: EditModalProps): ReactElement | null {
  const { open, accent, onSave, onCancel, pickFile, extractIcon } = props;
  const [d, setD] = useState<ModalDraft | null>(props.draft);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setD(props.draft);
      setEmojiOpen(false);
    }
  }, [open, props.draft]);

  if (!open || !d) return null;

  const set = (patch: Partial<ModalDraft>) => setD((p) => p ? { ...p, ...patch } : p);

  const handleFileRowClick = async () => {
    const kind: PickKind = d.type === 'app' ? 'app' : 'file';
    const p = await pickFile(kind);
    if (p) {
      const name = basename(p);
      set({ path: p, label: d.label || name, autoFrom: name, icon: { kind: 'auto' } });
      void extractIcon(p, d.id);
    }
  };

  const handleChooseImage = async () => {
    const p = await pickFile('image');
    if (p) {
      set({ icon: { ...d.icon, kind: 'image', sourcePath: p } });
    }
  };

  const handlePickEmoji = () => {
    set({ icon: { ...d.icon, kind: 'emoji', emoji: d.icon.emoji ?? '🚀' } });
    setEmojiOpen((o) => !o);
  };

  const handleLetterTile = () => {
    set({ icon: { ...d.icon, kind: 'letter', tileColor: d.icon.tileColor ?? accent } });
  };

  const handleTypeChange = (type: Button['type']) => {
    set({ type, path: '', autoFrom: undefined });
  };

  const handleSave = () => {
    const { isNew: _isNew, autoFrom: _autoFrom, ...button } = d;
    onSave(button);
  };

  const previewTile = () => {
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
    // auto
    const iconName = d.type === 'file' ? 'file' : d.type === 'app' ? 'app' : 'terminal';
    return (
      <div className="dp-prev-tile dp-prev-tile--key" style={{ color: accent }}>
        <DeckIcon name={iconName} size={28} />
      </div>
    );
  };

  const isCommand = d.type === 'command';
  const fileLabel = d.type === 'app' ? 'Application' : 'File';
  const filePlaceholder = d.type === 'app' ? 'Choose an application…' : 'Choose a file…';

  return (
    <div
      className="dp-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
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
              {(['command', 'file', 'app'] as const).map((v) => {
                const labels: Record<string, string> = {
                  command: 'Run command',
                  file: 'Open file',
                  app: 'Launch app'
                };
                return (
                  <button
                    key={v}
                    className={'dp-seg-btn' + (d.type === v ? ' is-on' : '')}
                    onClick={() => handleTypeChange(v)}
                  >
                    {labels[v]}
                  </button>
                );
              })}
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
            <div className="dp-field">
              <label className="dp-field-label">{fileLabel}</label>
              <div className="dp-picker">
                <button className="dp-file-row" onClick={handleFileRowClick}>
                  <DeckIcon
                    name={d.path
                      ? (d.type === 'app' ? 'app' : 'file')
                      : (d.type === 'app' ? 'app' : 'folderOpen')}
                    size={18}
                    style={{ color: d.path ? accent : '#7A7A86' }}
                  />
                  <span className={d.path ? 'dp-file-path' : 'dp-file-path is-placeholder'}>
                    {d.path || filePlaceholder}
                  </span>
                  <DeckIcon name="chevronDown" size={16} style={{ color: '#7A7A86', marginLeft: 'auto' }} />
                </button>
              </div>
            </div>
          )}

          {/* Icon section */}
          <div className="dp-field">
            <label className="dp-field-label">Icon</label>
            <div className="dp-icon-section">
              <div className="dp-prev-wrap">
                {previewTile()}
                {d.icon.kind === 'auto' && d.autoFrom && (
                  <span className="dp-auto-badge">Auto from file</span>
                )}
              </div>
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
            disabled={!d.label.trim()}
            onClick={handleSave}
          >
            Save action
          </button>
        </div>
      </div>
    </div>
  );
}
