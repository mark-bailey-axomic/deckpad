import type { Button, DialogView, Surface } from '@shared/types';
import type { ModalDraft } from '../components/EditModal';
import type { SettingsValues } from '../components/Settings';
import type { ActivityItem } from '../components/ActivityPanel';

// Payloads sent INTO a dialog window on open (and via updateDialog for activity).
export interface EditPayload { draft: ModalDraft; index: number; accent: string; surface: Surface }
export interface SettingsPayload { settings: SettingsValues; accent: string; surface: Surface }
export interface ActivityPayload { items: ActivityItem[]; now: number; accent: string; surface: Surface }

// Messages sent OUT of a dialog window → main → main window.
export type DialogMessage =
  | { type: 'save'; button: Button; index: number }   // edit
  | { type: 'settings-change'; patch: Partial<SettingsValues> }
  | { type: 'activity-stop'; buttonId: string };

// Lifecycle messages injected by the main process (not originated by the dialog renderer).
export type DialogLifecycleMessage = { type: 'dialog-closed' };

// Anything the main window's dialog-message handler may receive over the wire.
export type DialogWireMessage = DialogMessage | DialogLifecycleMessage;

/** Plain non-null, non-array object — arrays pass `typeof === 'object'` so exclude them explicitly. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Runtime check that a payload structurally matches its routed view (guards tampered/mismatched URLs). */
export function isValidPayload(view: DialogView, p: unknown): boolean {
  if (!isObject(p)) return false;
  if (typeof p.accent !== 'string' || typeof p.surface !== 'string') return false;
  switch (view) {
    case 'edit': return isObject(p.draft) && typeof p.index === 'number';
    case 'settings': return isObject(p.settings);
    case 'activity': return Array.isArray(p.items) && typeof p.now === 'number';
  }
}
