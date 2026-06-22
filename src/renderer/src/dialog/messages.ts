import type { Button } from '@shared/types';
import type { ModalDraft } from '../components/EditModal';
import type { SettingsValues } from '../components/Settings';
import type { ActivityItem } from '../components/ActivityPanel';

// Payloads sent INTO a dialog window on open (and via updateDialog for activity).
export interface EditPayload { draft: ModalDraft; index: number; accent: string; surface: string }
export interface SettingsPayload { settings: SettingsValues; accent: string; surface: string }
export interface ActivityPayload { items: ActivityItem[]; now: number; accent: string; surface: string }

// Messages sent OUT of a dialog window → main → main window.
export type DialogMessage =
  | { type: 'save'; button: Button; index: number }   // edit
  | { type: 'settings-change'; patch: Partial<SettingsValues> }
  | { type: 'activity-stop'; buttonId: string };
