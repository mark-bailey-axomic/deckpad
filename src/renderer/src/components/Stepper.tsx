import type { ReactElement } from 'react';
import { DeckIcon } from './DeckIcon';

export interface StepperProps { value: number; min: number; max: number; onChange: (v: number) => void; suffix: string }

export function Stepper({ value, min, max, onChange, suffix }: StepperProps): ReactElement {
  return (
    <div className="dp-stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease"><DeckIcon name="minimize" size={14} /></button>
      <span className="dp-stepper-val">{value}<em>{suffix}</em></span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase"><DeckIcon name="plus" size={14} /></button>
    </div>
  );
}
