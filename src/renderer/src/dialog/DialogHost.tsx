import { useEffect, useState, type ReactElement } from 'react';
import type { Button, DeckApi, DialogView, Surface } from '@shared/types';
import { SURFACES, GLOW, RADIUS } from '@shared/constants';
import { EditModal } from '../components/EditModal';
import { Settings } from '../components/Settings';
import { ActivityPanel } from '../components/ActivityPanel';
import type { EditPayload, SettingsPayload, ActivityPayload, DialogMessage } from './messages';

interface Props {
  view: DialogView;
  id: string;
  deck: DeckApi;
}

export function DialogHost({ view, id, deck }: Props): ReactElement | null {
  const [payload, setPayload] = useState<unknown>(undefined);

  useEffect(() => { void deck.getDialogPayload(id).then(setPayload); }, [deck, id]);

  // Activity is independent + live: re-render when main window pushes fresh data.
  useEffect(() => deck.onDialogUpdate((p) => setPayload(p)), [deck]);

  if (payload === undefined) return null;

  const send = (message: DialogMessage) => void deck.sendDialogMessage(id, message);
  const close = () => void deck.closeDialog(id);
  const sendThenClose = (message: DialogMessage) => { send(message); close(); };

  const accent = (payload as { accent: string }).accent;
  const surface = (payload as { surface: Surface }).surface;
  const surf = SURFACES[surface] ?? SURFACES['near-black'];
  const style = {
    width: '100%', height: '100%', background: surf.bg,
    '--accent': accent, '--key': surf.key, '--key-hi': surf.keyHi,
    // GLOW is a number (0.7); stringify for CSS custom property
    '--glow': String(GLOW), '--radius': `${RADIUS}px`
  } as React.CSSProperties;

  return (
    <div className="dp-dialog-window" style={style}>
      {view === 'edit' && (() => {
        const p = payload as EditPayload;
        return (
          <EditModal
            open
            draft={p.draft}
            accent={accent}
            onSave={(button: Button) => sendThenClose({ type: 'save', button, index: p.index })}
            onCancel={close}
            pickFile={(kind) => deck.pickFile(kind)}
            extractIcon={(path, buttonId) => deck.extractIcon(path, buttonId)}
          />
        );
      })()}

      {view === 'settings' && (() => {
        const p = payload as SettingsPayload;
        return (
          <Settings
            open
            settings={p.settings}
            onChange={(patch) => send({ type: 'settings-change', patch })}
            onClose={close}
          />
        );
      })()}

      {view === 'activity' && (() => {
        const p = payload as ActivityPayload;
        return (
          <ActivityPanel
            open
            items={p.items}
            now={p.now}
            accent={accent}
            onStop={(buttonId) => send({ type: 'activity-stop', buttonId })}
            onClose={close}
          />
        );
      })()}
    </div>
  );
}
