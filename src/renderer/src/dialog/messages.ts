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

/** Runtime check that a payload structurally matches its routed view (guards tampered/mismatched URLs). */
export function isValidPayload(view: DialogView, p: unknown): boolean {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  if (typeof o.accent !== 'string' || typeof o.surface !== 'string') return false;
  switch (view) {
    case 'edit': return 'draft' in o && typeof o.index === 'number';
    case 'settings': return typeof o.settings === 'object' && o.settings !== null;
    case 'activity': return Array.isArray(o.items) && typeof o.now === 'number';
  }
}
