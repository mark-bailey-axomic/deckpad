import { useEffect, useState, type ReactElement } from 'react';
import type { DeckApi, DialogView, Surface } from '@shared/types';
import { SURFACES, GLOW, RADIUS } from '@shared/constants';
import { EditModal } from '../components/EditModal';
import { Settings } from '../components/Settings';
import type { SettingsValues } from '../components/Settings';
import { ActivityPanel } from '../components/ActivityPanel';
import type { EditPayload, SettingsPayload, ActivityPayload, DialogMessage } from './messages';

interface Props {
  view: DialogView;
  id: string;
  deck: DeckApi;
}

export function DialogHost({ view, id, deck }: Props): ReactElement | null {
  const [payload, setPayload] = useState<unknown>(undefined);
  const [settingsDraft, setSettingsDraft] = useState<SettingsValues | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    deck.getDialogPayload(id)
      .then((p) => { if (p == null) setFailed(true); else setPayload(p); })
      .catch(() => setFailed(true));
  }, [deck, id]);

  // Activity is independent + live: re-render when main window pushes fresh data.
  useEffect(() => {
    if (view !== 'activity') return;
    return deck.onDialogUpdate((p) => { if (p != null) setPayload(p); });
  }, [deck, view]);

  if (failed) return <div className="dp-dialog-window" style={{ padding: 16 }}>Dialog unavailable.</div>;

  if (payload === undefined) return null;

  const send = (message: DialogMessage) => void deck.sendDialogMessage(id, message);
  const close = () => void deck.closeDialog(id);
  const sendThenClose = async (message: DialogMessage) => {
    await deck.sendDialogMessage(id, message);
    await deck.closeDialog(id);
  };

  const accent = (payload as { accent: string }).accent;
  const surface = (payload as { surface: Surface }).surface;
  const surf = SURFACES[surface] ?? SURFACES['near-black'];
  const style = {
    width: '100%', height: '100%', background: surf.bg,
    '--accent': accent, '--key': surf.key, '--key-hi': surf.keyHi,
    // GLOW is a number (0.7); stringify for CSS custom property
    '--glow': String(GLOW), '--radius': `${RADIUS}px`
  } as React.CSSProperties;

  // Settings view: derive style from live draft so accent/surface updates reflect instantly.
  const base = view === 'settings' ? (payload as SettingsPayload).settings : null;
  const effectiveSettings = (base !== null ? (settingsDraft ?? base) : null)!;
  const settingsSurf = base !== null ? (SURFACES[effectiveSettings.surface] ?? SURFACES['near-black']) : null;
  const settingsStyle = base !== null ? {
    width: '100%', height: '100%', background: settingsSurf!.bg,
    '--accent': effectiveSettings.accent, '--key': settingsSurf!.key, '--key-hi': settingsSurf!.keyHi,
    '--glow': String(GLOW), '--radius': `${RADIUS}px`
  } as React.CSSProperties : null;

  return (
    <div className="dp-dialog-window" style={view === 'settings' ? settingsStyle! : style}>
      {view === 'edit' && (
        <EditModal
          open
          draft={(payload as EditPayload).draft}
          accent={accent}
          onSave={(button) => { void sendThenClose({ type: 'save', button, index: (payload as EditPayload).index }); }}
          onCancel={close}
          pickFile={(kind) => deck.pickFile(kind)}
          extractIcon={(path, buttonId) => deck.extractIcon(path, buttonId)}
        />
      )}

      {view === 'settings' && (
        <Settings
          open
          settings={effectiveSettings}
          onChange={(patch) => {
            setSettingsDraft(prev => ({ ...(prev ?? base!), ...patch }));
            send({ type: 'settings-change', patch });
          }}
          onClose={close}
        />
      )}

      {view === 'activity' && (
        <ActivityPanel
          open
          items={(payload as ActivityPayload).items}
          now={(payload as ActivityPayload).now}
          accent={accent}
          onStop={(buttonId) => send({ type: 'activity-stop', buttonId })}
          onClose={close}
        />
      )}
    </div>
  );
}
