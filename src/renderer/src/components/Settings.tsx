import type { ReactElement } from 'react';
import type { Surface } from '@shared/types';
import { ACCENTS } from '@shared/constants';
import { DeckIcon } from './DeckIcon';
import { Stepper } from './Stepper';
import { ToggleRow } from './ToggleRow';

export interface SettingsValues {
  cols: number;
  rows: number;
  accent: string;
  surface: Surface;
  showLabels: boolean;
  launchStartup: boolean;
  alwaysOnTop: boolean;
}

export interface SettingsProps {
  open: boolean;
  settings: SettingsValues;
  onChange: (patch: Partial<SettingsValues>) => void;
  onClose: () => void;
}

const SURFACE_OPTS = [
  { id: 'near-black' as const, name: 'Near-black', bg: '#0E0E10', key: '#1A1A1E' },
  { id: 'charcoal' as const, name: 'Charcoal', bg: '#161619', key: '#202026' },
  { id: 'ink-blue' as const, name: 'Ink blue', bg: '#0B0F17', key: '#161C28' },
];

export function Settings({ open, settings, onChange, onClose }: SettingsProps): ReactElement {
  return (
    <div className={'dp-sheet' + (open ? ' is-open' : '')}>
      <div className="dp-sheet-head">
        <div className="dp-panel-title">Settings</div>
        <button className="dp-icon-btn" onClick={onClose} aria-label="Close">
          <DeckIcon name="close" size={18} />
        </button>
      </div>
      <div className="dp-sheet-body">
        <div className="dp-field">
          <label className="dp-field-label">Grid size</label>
          <div className="dp-stepper-row">
            <Stepper value={settings.cols} min={2} max={6} onChange={(v) => onChange({ cols: v })} suffix="cols" />
            <span className="dp-times">×</span>
            <Stepper value={settings.rows} min={2} max={5} onChange={(v) => onChange({ rows: v })} suffix="rows" />
          </div>
        </div>

        <div className="dp-field">
          <label className="dp-field-label">Accent color</label>
          <div className="dp-swatches">
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={'dp-swatch' + (settings.accent === c ? ' is-on' : '')}
                style={{ background: c }}
                onClick={() => onChange({ accent: c })}
                aria-label={c}
              >
                {settings.accent === c && <DeckIcon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>

        <div className="dp-field">
          <label className="dp-field-label">Background</label>
          <div className="dp-surf-opts">
            {SURFACE_OPTS.map((s) => (
              <button
                key={s.id}
                className={'dp-surf-opt' + (settings.surface === s.id ? ' is-on' : '')}
                onClick={() => onChange({ surface: s.id })}
              >
                <span className="dp-surf-chip" style={{ background: s.bg }}>
                  <span className="dp-surf-key" style={{ background: s.key }} />
                </span>
                <span className="dp-surf-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>

        <ToggleRow label="Show labels" value={settings.showLabels} onChange={(v) => onChange({ showLabels: v })} />
        <ToggleRow label="Launch at startup" value={settings.launchStartup} onChange={(v) => onChange({ launchStartup: v })} />
        <ToggleRow label="Always on top" value={settings.alwaysOnTop} onChange={(v) => onChange({ alwaysOnTop: v })} />
      </div>
    </div>
  );
}
