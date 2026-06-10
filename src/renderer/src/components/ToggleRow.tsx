import type { ReactElement } from 'react';

export interface ToggleRowProps { label: string; value: boolean; onChange: (v: boolean) => void }

export function ToggleRow({ label, value, onChange }: ToggleRowProps): ReactElement {
  return (
    <button className="dp-toggle-row" onClick={() => onChange(!value)}>
      <span>{label}</span>
      <span className={'dp-switch' + (value ? ' is-on' : '')}><span className="dp-switch-knob" /></span>
    </button>
  );
}
