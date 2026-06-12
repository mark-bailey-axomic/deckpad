import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { BAR_H, GLOW, GRID_LIMITS, KEY_SIZE, GAP, PAD, RADIUS, SURFACES, TABS_H } from '@shared/constants';
import { indexOfId, insertShiftReorder, resizeGroups } from '@shared/layout';
import type { Button, Config, Group } from '@shared/types';
import { getDeck } from './lib/deck';
import { useActionStates, type FailInfo } from './hooks/useActionStates';
import { useNowTick } from './hooks/useNowTick';
import { Key } from './components/Key';
import { DeckIcon } from './components/DeckIcon';
import { Toast, type ToastState } from './components/Toast';
import { ContextMenu, type MenuState } from './components/ContextMenu';
import { EditModal, newDraft, type ModalDraft } from './components/EditModal';
import { ActivityPanel, type ActivityItem } from './components/ActivityPanel';
import { Settings, type SettingsValues } from './components/Settings';
import { Stepper } from './components/Stepper';

const deck = getDeck();

const IDLE_RUNTIME = { state: 'idle' as const, log: [], failedDot: false };

export function App(): ReactElement | null {
  const [config, setConfig] = useState<Config | null>(null);
  const [active, setActive] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gridPop, setGridPop] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [modal, setModal] = useState<{ draft: ModalDraft; index: number } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ gi: number; value: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // drag state
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // group-tab drag state (separate from the key drag above so the two never interfere)
  const groupDragFrom = useRef<number | null>(null);
  const [groupDragOver, setGroupDragOver] = useState<number | null>(null);

  useEffect(() => { void deck.getConfig().then(setConfig); }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Stable read of the latest config for callbacks (avoids stale closures).
  const configRef = useRef<Config | null>(null);
  configRef.current = config;

  const showToast = useCallback((t: ToastState) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  /** Single mutate-and-persist path: every config change flows through here. */
  const commit = useCallback((fn: (prev: Config) => Config) => {
    const prev = configRef.current;
    if (!prev) return;
    const next = fn(prev);
    configRef.current = next;
    deck.saveConfig(next).catch(() => showToast({ kind: 'info', message: 'Could not save changes' }));
    setConfig(next);
  }, [showToast]);

  const onFail = useCallback((f: FailInfo) => {
    const cfg = configRef.current;
    const label = cfg ? findLabel(cfg, f.buttonId) : f.buttonId;
    showToast({ kind: 'fail', buttonId: f.buttonId, label, exit: f.exit });
  }, [showToast]);

  const { runtimes, press, stop } = useActionStates(deck, onFail);
  // Count only buttons that still exist in the config — deleted/stale ids must not show.
  const runningCount = useMemo(() => {
    if (!config) return 0;
    return config.groups
      .flatMap((g) => g.slots)
      .filter((s) => s && runtimes.get(s.id)?.state === 'running').length;
  }, [config, runtimes]);
  const now = useNowTick(runningCount > 0);

  // close menus on global click / esc (prototype lines 247–253)
  useEffect(() => {
    const onDoc = () => { setMenu(null); setGridPop(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setModal(null); setSettingsOpen(false); setGridPop(false); setRenaming(null); }
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  if (!config) return null;
  const { cols, rows } = config.grid;
  const activeIndex = Math.min(active, config.groups.length - 1);
  const group = config.groups[activeIndex];
  const accent = config.settings.accent;
  const surf = SURFACES[config.settings.surface];
  const actionCount = group.slots.filter(Boolean).length;

  // ---- slot/group mutations (all via commit) ----
  /** Deleting a button must also stop its process if one is active. */
  const stopIfActive = (id: string) => {
    const st = runtimes.get(id)?.state;
    if (st === 'running' || st === 'launching') stop(id);
  };

  const setSlots = (fn: (slots: (Button | null)[]) => (Button | null)[]) =>
    commit((cfg) => ({
      ...cfg,
      groups: cfg.groups.map((g, i) => (i === Math.min(active, cfg.groups.length - 1) ? { ...g, slots: fn(g.slots) } : g))
    }));

  const onDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOver(null);
    if (from === null || from === idx) return;
    setSlots((slots) => insertShiftReorder(slots, from, idx)); // persists via commit
  };

  const onDragEnd = () => {
    dragFrom.current = null;
    setDragOver(null);
  };

  const onGroupDrop = (e: React.DragEvent, gi: number) => {
    e.preventDefault();
    const from = groupDragFrom.current;
    groupDragFrom.current = null;
    setGroupDragOver(null);
    if (from === null || from === gi) return;
    const activeId = config.groups[activeIndex].id;
    commit((cfg) => ({ ...cfg, groups: insertShiftReorder(cfg.groups, from, gi) }));
    // commit is synchronous and updates configRef.current — read the committed order back
    // so the active group follows its tab regardless of index shifts.
    setActive(indexOfId(configRef.current!.groups, activeId));
  };

  const onGroupDragEnd = () => {
    groupDragFrom.current = null;
    setGroupDragOver(null);
  };

  /** Grid change with compact-on-shrink + confirm naming the losses.
   *  Confirm runs OUTSIDE the state updater (updaters must stay pure under StrictMode). */
  const changeGrid = (newCols: number, newRows: number) => {
    const cfg = configRef.current;
    if (!cfg) return;
    const { groups, lost } = resizeGroups(cfg.groups, newCols, newRows);
    if (lost > 0 && !window.confirm(`Shrinking the grid will delete ${lost} button${lost === 1 ? '' : 's'}. Continue?`)) {
      return; // cancelled — grid unchanged
    }
    commit((prev) => ({ ...prev, grid: { cols: newCols, rows: newRows }, groups }));
  };

  const pressKey = (idx: number) => {
    const b = group.slots[idx];
    if (!b) { setModal({ draft: newDraft(), index: idx }); return; }
    if (editMode) { setModal({ draft: { ...structuredClone(b), isNew: false }, index: idx }); return; }
    setPressedId(b.id);
    setTimeout(() => setPressedId(null), 160);
    press(b);
  };

  const saveModal = (button: Button) => {
    const idx = modal!.index;
    setSlots((slots) => slots.map((s, i) => (i === idx ? button : s)));
    setModal(null);
  };

  const addGroup = () => {
    const nextIndex = config.groups.length;
    commit((cfg) => ({
      ...cfg,
      groups: [...cfg.groups, { id: crypto.randomUUID(), name: `Group ${cfg.groups.length + 1}`, slots: Array(cols * rows).fill(null) } satisfies Group]
    }));
    setActive(nextIndex);
  };

  const deleteGroup = (gi: number) => {
    if (config.groups.length <= 1) return; // min 1 group
    const target = config.groups[gi];
    const keyCount = target.slots.filter(Boolean).length;
    if (keyCount > 0 && !window.confirm(`Delete group "${target.name}" and its ${keyCount} key${keyCount === 1 ? '' : 's'}?`)) {
      return;
    }
    target.slots.forEach((s) => { if (s) stopIfActive(s.id); });
    commit((cfg) => ({ ...cfg, groups: cfg.groups.filter((_, i) => i !== gi) }));
    setActive((a) => Math.max(0, gi <= a ? a - 1 : a));
  };

  const commitRename = () => {
    if (!renaming) return;
    const { gi, value } = renaming;
    commit((cfg) => ({ ...cfg, groups: cfg.groups.map((g, i) => (i === gi ? { ...g, name: value.trim() || 'Untitled' } : g)) }));
    setRenaming(null);
  };

  // ---- context menu actions ----
  const ctxEdit = () => {
    if (!menu) return;
    const b = group.slots[menu.index];
    setMenu(null);
    if (b) setModal({ draft: { ...structuredClone(b), isNew: false }, index: menu.index });
  };
  const ctxDuplicate = () => {
    if (!menu) return;
    const src = group.slots[menu.index];
    setMenu(null);
    if (!src) return;
    const empty = group.slots.findIndex((s) => s === null);
    if (empty < 0) {
      showToast({ kind: 'info', message: 'No empty slot in this group — duplicate needs space' });
      return;
    }
    const copy: Button = structuredClone(src);
    copy.id = crypto.randomUUID();
    setSlots((slots) => slots.map((s, i) => (i === empty ? copy : s)));
    // icon cache for the copy is reconciled by main's syncIconCache on save
  };
  const ctxDelete = () => {
    if (!menu) return;
    const idx = menu.index;
    const b = group.slots[idx];
    if (b) stopIfActive(b.id);
    setSlots((slots) => slots.map((s, i) => (i === idx ? null : s)));
    setMenu(null);
  };

  // ---- settings ----
  const onSettingsChange = (patch: Partial<SettingsValues>) => {
    if ('cols' in patch || 'rows' in patch) {
      changeGrid(patch.cols ?? cols, patch.rows ?? rows);
      return;
    }
    if (patch.launchStartup !== undefined) void deck.setLoginItem(patch.launchStartup);
    if (patch.alwaysOnTop !== undefined) void deck.setAlwaysOnTop(patch.alwaysOnTop);
    commit((cfg) => ({ ...cfg, settings: { ...cfg.settings, ...patch } }));
  };

  // Activity panel items: running first, then failed-dot entries (persist until next run)
  const panelItems: ActivityItem[] = config.groups.flatMap((g) =>
    g.slots.filter((s): s is Button => s !== null).flatMap((b): ActivityItem[] => {
      const rt = runtimes.get(b.id);
      if (!rt) return [];
      if (rt.state === 'running') return [{ button: b, groupName: g.name, state: 'running' as const, startedAt: rt.startedAt, log: rt.log }];
      if (rt.state === 'failed' || rt.failedDot)
        return [{ button: b, groupName: g.name, state: 'failed' as const, log: rt.log, exit: rt.exit ?? 1, ranFor: rt.ranFor ?? 0 }];
      return [];
    })
  );

  return (
    <div
      className="dp-window"
      style={{
        width: '100%', height: '100%',
        background: surf.bg,
        '--accent': accent, '--key': surf.key, '--key-hi': surf.keyHi,
        '--glow': GLOW, '--radius': `${RADIUS}px`
      } as CSSProperties}
    >
      {/* top bar */}
      <div className={'dp-bar' + (deck.platform === 'darwin' ? ' is-mac' : '')} style={{ height: BAR_H }}>
        <div className="dp-brand">
          <span className="dp-mark" style={{ background: accent }}><DeckIcon name="bolt" size={13} style={{ color: '#0b0b0d' }} /></span>
          <span className="dp-brand-name">DeckPad</span>
        </div>
        {runningCount > 0 && (
          <button className="dp-pill" onClick={(e) => { e.stopPropagation(); setPanelOpen((o) => !o); }}>
            <span className="dp-pill-dot" style={{ background: accent }} />
            {runningCount} running
          </button>
        )}
        <div className="dp-bar-right">
          <div className="dp-grid-ctrl" onClick={(e) => e.stopPropagation()}>
            <button className={'dp-icon-btn' + (gridPop ? ' is-active' : '')} onClick={() => setGridPop((p) => !p)} title="Grid size">
              <DeckIcon name="app" size={17} /><span className="dp-grid-label">{cols}×{rows}</span>
            </button>
            {gridPop && (
              <div className="dp-grid-pop">
                <div className="dp-pop-row">
                  <span>Columns</span>
                  <Stepper value={cols} min={GRID_LIMITS.cols.min} max={GRID_LIMITS.cols.max}
                    onChange={(v) => changeGrid(v, rows)} suffix="" />
                </div>
                <div className="dp-pop-row">
                  <span>Rows</span>
                  <Stepper value={rows} min={GRID_LIMITS.rows.min} max={GRID_LIMITS.rows.max}
                    onChange={(v) => changeGrid(cols, v)} suffix="" />
                </div>
              </div>
            )}
          </div>
          <button className={'dp-icon-btn' + (editMode ? ' is-active' : '')} onClick={() => setEditMode((e2) => !e2)} title="Edit layout">
            <DeckIcon name="pencil" size={17} />
          </button>
          <button className={'dp-icon-btn' + (settingsOpen ? ' is-active' : '')} onClick={(e) => { e.stopPropagation(); setSettingsOpen((o) => !o); }} title="Settings">
            <DeckIcon name="gear" size={18} />
          </button>
          {deck.platform !== 'darwin' && (
            <button className="dp-close-btn" aria-label="Close window" onClick={() => window.close()}>
              <DeckIcon name="close" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* group tabs */}
      <div className="dp-tabs" style={{ height: TABS_H }} onClick={(e) => e.stopPropagation()}>
        <div className="dp-tabs-scroll">
          {config.groups.map((g, gi) => {
            const isActive = gi === activeIndex;
            const hasRunning = g.slots.some((k) => k && runtimes.get(k.id)?.state === 'running');
            const isRenaming = renaming !== null && renaming.gi === gi;
            return (
              <div key={g.id}
                className={'dp-tab' + (isActive ? ' is-active' : '')
                  + (editMode && config.groups.length > 1 ? ' is-edit' : '')
                  + (groupDragOver === gi ? ' is-dragover' : '')}
                draggable={editMode && !isRenaming && config.groups.length > 1}
                onClick={() => { setActive(gi); setRenaming(null); }}
                onDoubleClick={() => setRenaming({ gi, value: g.name })}
                onDragStart={() => { setRenaming(null); groupDragFrom.current = gi; }}
                onDragOver={(e) => { if (editMode && groupDragFrom.current !== null) { e.preventDefault(); setGroupDragOver(gi); } }}
                onDragEnd={onGroupDragEnd}
                onDrop={(e) => onGroupDrop(e, gi)}
                title="Double-click to rename">
                {hasRunning && <span className="dp-tab-dot" style={{ background: accent }} />}
                {isRenaming ? (
                  <input className="dp-tab-input" autoFocus value={renaming.value}
                    onChange={(e) => setRenaming({ gi, value: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} />
                ) : <span className="dp-tab-name">{g.name}</span>}
                {editMode && config.groups.length > 1 && !isRenaming && (
                  <span className="dp-tab-del" role="button" aria-label="Delete group"
                    onClick={(e) => { e.stopPropagation(); deleteGroup(gi); }}><DeckIcon name="close" size={11} /></span>
                )}
              </div>
            );
          })}
          <button className="dp-tab-add" onClick={addGroup} title="New group"><DeckIcon name="plus" size={15} /></button>
        </div>
        <span className="dp-tabs-count">{actionCount} action{actionCount === 1 ? '' : 's'}</span>
      </div>

      {/* grid */}
      <div className="dp-grid" key={group.id} style={{
        gridTemplateColumns: `repeat(${cols}, ${KEY_SIZE}px)`,
        gridTemplateRows: `repeat(${rows}, ${KEY_SIZE}px)`,
        gap: GAP, padding: PAD
      }}>
        {group.slots.map((s, idx) => (
          <Key key={idx} button={s}
            runtime={(s && runtimes.get(s.id)) ?? IDLE_RUNTIME}
            now={now} accent={accent} editMode={editMode}
            showLabels={config.settings.showLabels}
            pressed={pressedId !== null && pressedId === s?.id}
            dragOver={dragOver === idx}
            onPress={() => pressKey(idx)}
            onStop={() => { if (s) stop(s.id); }}
            onContext={(e) => { e.preventDefault(); e.stopPropagation(); if (s) setMenu({ x: e.clientX, y: e.clientY, index: idx }); }}
            onDelete={() => { if (s) stopIfActive(s.id); setSlots((slots) => slots.map((k, j) => (j === idx ? null : k))); }}
            onDragStart={() => { dragFrom.current = idx; }}
            onDragOver={(e) => { if (editMode && dragFrom.current !== null) { e.preventDefault(); setDragOver(idx); } }}
            onDragEnd={onDragEnd}
            onDrop={(e) => onDrop(e, idx)} />
        ))}
      </div>

      <ActivityPanel open={panelOpen} items={panelItems} now={now} accent={accent}
        onStop={stop} onClose={() => setPanelOpen(false)} />
      <Settings open={settingsOpen}
        settings={{ cols, rows, accent, surface: config.settings.surface, showLabels: config.settings.showLabels, launchStartup: config.settings.launchStartup, alwaysOnTop: config.settings.alwaysOnTop }}
        onChange={onSettingsChange}
        onClose={() => setSettingsOpen(false)} />

      <div className="dp-toast-layer">
        <Toast toast={toast} onView={() => { setPanelOpen(true); setToast(null); }} onClose={() => setToast(null)} />
      </div>

      <ContextMenu menu={menu} onEdit={ctxEdit} onDuplicate={ctxDuplicate} onDelete={ctxDelete} />
      <EditModal open={modal !== null} draft={modal?.draft ?? null} accent={accent}
        onSave={saveModal} onCancel={() => setModal(null)}
        pickFile={(kind) => deck.pickFile(kind)}
        extractIcon={(path, buttonId) => deck.extractIcon(path, buttonId)} />
    </div>
  );
}

function findLabel(cfg: Config, buttonId: string): string {
  for (const g of cfg.groups) for (const s of g.slots) if (s?.id === buttonId) return s.label;
  return buttonId;
}
