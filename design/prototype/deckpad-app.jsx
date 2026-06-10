// deckpad-app.jsx — DeckPad main application.
const DeckIcon = window.DeckIcon;
const { fmtElapsed, Toast, ActivityPanel, ContextMenu, Settings, Stepper, EditModal, Key, DeckTweaks } = window;
const { useState, useEffect, useRef, useCallback } = React;
const {
  useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakColor,
} = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#34D399",
  "cols": 4,
  "rows": 3,
  "keySize": 104,
  "gap": 14,
  "radius": 16,
  "glow": 0.7,
  "showLabels": true,
  "surface": "near-black",
  "launchStartup": true,
  "alwaysOnTop": false
}/*EDITMODE-END*/;

const SURFACES = {
  "near-black": { bg: "#0E0E10", key: "#1A1A1E", keyHi: "#26262C", wall: "radial-gradient(120% 120% at 50% 0%, #1b1b22 0%, #0a0a0c 60%)" },
  "charcoal": { bg: "#161619", key: "#202026", keyHi: "#2C2C34", wall: "radial-gradient(120% 120% at 50% 0%, #232330 0%, #101014 60%)" },
  "ink-blue": { bg: "#0B0F17", key: "#161C28", keyHi: "#202A3A", wall: "radial-gradient(120% 120% at 50% 0%, #16203a 0%, #070a12 60%)" },
};

// log line generators per action
const LOGS = {
  "Dev Server": ["✓ compiled in 412ms", "  hmr update /src/App.tsx", "  hmr update /src/styles.css", "GET /api/projects 200 14ms", "GET /assets/hero.png 200 3ms", "✓ compiled in 121ms"],
  "Backup": ["rsync: scanning 14,228 files", "  → db/dump-0413.sql.gz  (812 MB)", "  → uploads/ 2,140 files", "sent 1.2 GB  received 4 KB", "  total size 4.9 GB", "  checkpoint written"],
  "DB Backup": ["pg_dump: dumping schema public", "  → table projects (1.2M rows)", "  → table assets (480k rows)", "  writing dump-0610.sql.gz", "  done in 41.2s"],
  "Restart API": ["[pm2] stopping api…", "[pm2] api ✗ stopped", "[pm2] starting api…", "[api] listening on :8080", "[api] db pool ready (10)", "[api] healthcheck ok"],
  "Tail Logs": ["[nginx] 200 GET /  12ms", "[nginx] 200 GET /api/me  8ms", "[api] cache hit projects:list", "[nginx] 304 GET /assets/app.js", "[api] 201 POST /api/proposals"],
  "_generic": ["working…", "  processing", "  done"],
};
const FAIL_LOG = {
  "Screenshot OCR": ["$ ocr --capture region", "capturing region 0,0 1920x1080…", "tesseract: loading eng.traineddata", "Error: language pack 'eng' not found", "  at resolveLang (ocr.js:142)", "exited with code 1"],
};

function makeKey(o) { return { state: "idle", log: [], failedDot: false, iconKind: "auto", ...o }; }
function fit(arr, n) { const next = arr.slice(0, n); while (next.length < n) next.push(null); return next; }

const DEV_SLOTS = [
  makeKey({ id: "k1", label: "Dev Server", icon: "terminal", type: "command", command: "npm run dev", cwd: "~/dev/acme-web", behavior: "service", state: "running", startedAt: Date.now() - (12 * 60 + 34) * 1000 }),
  makeKey({ id: "k2", label: "Deploy", icon: "rocket", type: "command", command: "./deploy.sh prod", behavior: "oneshot" }),
  makeKey({ id: "k3", label: "Open Project", icon: "code", type: "app", path: "/Applications/Visual Studio Code.app", behavior: "oneshot" }),
  makeKey({ id: "k4", label: "Backup", icon: "database", type: "command", command: "rsync -a ./ /backup", behavior: "service", state: "running", startedAt: Date.now() - (3 * 60 + 7) * 1000 }),
  makeKey({ id: "k5", label: "Downloads", icon: "folder", type: "file", path: "~/Downloads", behavior: "oneshot" }),
  makeKey({ id: "k6", label: "Dashboard", icon: "monitor", type: "file", path: "https://grafana.acme.dev", behavior: "oneshot" }),
  makeKey({ id: "k7", label: "Screenshot OCR", icon: "camera", type: "command", command: "ocr --capture region", behavior: "fail" }),
  makeKey({ id: "k8", label: "Git Pull", icon: "git", type: "command", command: "git pull --rebase", behavior: "oneshot" }),
  makeKey({ id: "k9", label: "Run Tests", icon: "beaker", type: "command", command: "npm test", behavior: "oneshot" }),
  makeKey({ id: "k10", label: "Restart API", icon: "refresh", type: "command", command: "pm2 restart api", behavior: "service" }),
  null, null,
];
DEV_SLOTS[0].log = Array.from({ length: 40 }, (_, i) => LOGS["Dev Server"][i % LOGS["Dev Server"].length]);
DEV_SLOTS[3].log = Array.from({ length: 30 }, (_, i) => LOGS["Backup"][i % LOGS["Backup"].length]);

const DESIGN_SLOTS = [
  makeKey({ id: "d1", label: "Open Figma", icon: "pencil", type: "app", path: "/Applications/Figma.app", behavior: "oneshot" }),
  makeKey({ id: "d2", label: "Assets", icon: "folder", type: "file", path: "~/Design/assets", behavior: "oneshot" }),
  makeKey({ id: "d3", label: "Export PNG", icon: "image", type: "command", command: "figma-export --scale 2 --png", behavior: "oneshot" }),
  makeKey({ id: "d4", label: "Moodboard", icon: "monitor", type: "file", path: "https://www.figma.com/board/moodboard", behavior: "oneshot" }),
  makeKey({ id: "d5", label: "Brand Kit", icon: "app", type: "file", path: "~/Design/brand-kit.sketch", iconKind: "letter", tileColor: "#8B5CF6", behavior: "oneshot" }),
];
const OPS_SLOTS = [
  makeKey({ id: "o1", label: "Deploy Prod", icon: "rocket", type: "command", command: "./deploy.sh prod", behavior: "oneshot" }),
  makeKey({ id: "o2", label: "Tail Logs", icon: "terminal", type: "command", command: "kubectl logs -f api", behavior: "service" }),
  makeKey({ id: "o3", label: "Restart API", icon: "refresh", type: "command", command: "pm2 restart api", behavior: "service" }),
  makeKey({ id: "o4", label: "DB Backup", icon: "database", type: "command", command: "pg_dump prod | gzip", behavior: "service" }),
  makeKey({ id: "o5", label: "Flush Cache", icon: "bolt", type: "command", command: "redis-cli FLUSHALL", behavior: "oneshot" }),
  makeKey({ id: "o6", label: "Status Page", icon: "monitor", type: "file", path: "https://status.acme.dev", behavior: "oneshot" }),
];

const INITIAL_GROUPS = [
  { id: "g-dev", name: "Dev", slots: DEV_SLOTS.slice() },
  { id: "g-design", name: "Design", slots: DESIGN_SLOTS.slice() },
  { id: "g-ops", name: "Ops", slots: OPS_SLOTS.slice() },
];

let uid = 100;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accent = t.accent;
  const cols = t.cols, rows = t.rows;
  const cells = cols * rows;
  const surf = SURFACES[t.surface] || SURFACES["near-black"];

  const [groups, setGroups] = useState(() => INITIAL_GROUPS.map((g) => ({ ...g, slots: fit(g.slots, cells) })));
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  useEffect(() => { activeRef.current = Math.min(active, groups.length - 1); }, [active, groups.length]);

  const [now, setNow] = useState(Date.now());
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [gridPop, setGridPop] = useState(false);
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [pressed, setPressed] = useState(null);
  const [renaming, setRenaming] = useState(null); // {gi, value}
  const dragFrom = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const timers = useRef({});
  const toastTimer = useRef(null);

  const slots = (groups[active] || groups[0]).slots;

  // update the active group's slots (accepts updater fn or value)
  const setSlots = useCallback((updater) => {
    setGroups((gs) => gs.map((g, i) => i === activeRef.current
      ? { ...g, slots: typeof updater === "function" ? updater(g.slots) : updater } : g));
  }, []);

  // keep slot counts synced to grid size across ALL groups
  useEffect(() => { setGroups((gs) => gs.map((g) => ({ ...g, slots: fit(g.slots, cells) }))); }, [cells]);

  // 1s tick: advance timers + append logs to every running key in every group
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(Date.now());
      setGroups((gs) => gs.map((g) => ({
        ...g,
        slots: g.slots.map((k) => {
          if (k && k.state === "running") {
            const pool = LOGS[k.label] || LOGS._generic;
            const line = pool[Math.floor(Math.random() * pool.length)];
            const log = [...k.log, line];
            return { ...k, log: log.length > 200 ? log.slice(-200) : log };
          }
          return k;
        }),
      })));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const patchSlot = useCallback((idx, patch) => {
    setSlots((prev) => prev.map((k, i) => (i === idx && k ? { ...k, ...patch } : k)));
  }, [setSlots]);

  const pressKey = (idx) => {
    const k = slots[idx];
    if (!k) { openModal(idx, null); return; }
    if (editMode) { openModal(idx, k); return; }
    if (k.state === "launching" || k.state === "running") return;
    setPressed(k.id);
    setTimeout(() => setPressed(null), 160);
    patchSlot(idx, { state: "launching", failedDot: false });
    clearTimeout(timers.current[k.id]);
    timers.current[k.id] = setTimeout(() => {
      if (k.behavior === "fail") {
        patchSlot(idx, { state: "failed", failedDot: true, exit: 1, log: FAIL_LOG[k.label] || ["error", "exited with code 1"] });
        showToast({ id: k.id, label: k.label, exit: 1 });
        setTimeout(() => patchSlot(idx, { state: "idle" }), 650);
      } else if (k.behavior === "service") {
        patchSlot(idx, { state: "running", startedAt: Date.now(), log: [] });
      } else {
        patchSlot(idx, { state: "success" });
        setTimeout(() => patchSlot(idx, { state: "idle" }), 850);
      }
    }, 1000);
  };

  const stopKey = (idx) => {
    const k = slots[idx]; if (!k) return;
    patchSlot(idx, { state: "launching" });
    setTimeout(() => patchSlot(idx, { state: "idle", startedAt: null }), 600);
  };
  // stop a running key anywhere (used by the activity panel)
  const stopKeyById = (id) => {
    setGroups((gs) => gs.map((g) => ({
      ...g, slots: g.slots.map((k) => k && k.id === id ? { ...k, state: "launching" } : k),
    })));
    setTimeout(() => setGroups((gs) => gs.map((g) => ({
      ...g, slots: g.slots.map((k) => k && k.id === id ? { ...k, state: "idle", startedAt: null } : k),
    }))), 600);
  };

  const showToast = (payload) => {
    setToast(payload);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  /* ---- modal ---- */
  const openModal = (index, key) => {
    setMenu(null);
    const draft = key
      ? { ...key, isNew: false, index }
      : { isNew: true, index, label: "", type: "command", command: "", cwd: "", showTerminal: false, icon: "app", iconKind: "auto", behavior: "oneshot", path: "" };
    setModal({ draft, index });
  };
  const saveModal = (d) => {
    const idx = modal.index;
    setSlots((prev) => prev.map((k, i) => {
      if (i !== idx) return k;
      const base = k || makeKey({ id: "k" + (++uid) });
      return { ...base, ...d, id: base.id, state: k ? k.state : "idle", isNew: undefined, index: undefined };
    }));
    setModal(null);
  };

  /* ---- context menu actions ---- */
  const ctxEdit = () => { const i = menu.index; openModal(i, slots[i]); };
  const ctxDuplicate = () => {
    const i = menu.index; const src = slots[i]; if (!src) return;
    const empty = slots.findIndex((s) => s === null);
    if (empty >= 0) setSlots((prev) => prev.map((k, j) => j === empty ? makeKey({ ...src, id: "k" + (++uid), state: "idle", startedAt: null, failedDot: false, log: [] }) : k));
    setMenu(null);
  };
  const ctxDelete = () => { const i = menu.index; setSlots((prev) => prev.map((k, j) => j === i ? null : k)); setMenu(null); };

  /* ---- drag reorder ---- */
  const onDrop = (idx) => {
    const from = dragFrom.current;
    if (from == null || from === idx) { setDragOver(null); return; }
    setSlots((prev) => { const next = [...prev]; const tmp = next[idx]; next[idx] = next[from]; next[from] = tmp; return next; });
    dragFrom.current = null; setDragOver(null);
  };

  /* ---- groups ---- */
  const addGroup = () => {
    const g = { id: "g" + (++uid), name: "Group " + (groups.length + 1), slots: fit([], cells) };
    setGroups((gs) => [...gs, g]);
    setActive(groups.length);
  };
  const deleteGroup = (gi) => {
    if (groups.length <= 1) return;
    setGroups((gs) => gs.filter((_, i) => i !== gi));
    setActive((a) => Math.max(0, (gi <= a ? a - 1 : a)));
  };
  const commitRename = () => {
    if (!renaming) return;
    const { gi, value } = renaming;
    const name = value.trim() || "Untitled";
    setGroups((gs) => gs.map((g, i) => i === gi ? { ...g, name } : g));
    setRenaming(null);
  };

  // close menus on global click / esc
  useEffect(() => {
    const onDoc = () => { setMenu(null); setGridPop(false); };
    const onKey = (e) => { if (e.key === "Escape") { setMenu(null); setModal(null); setSettingsOpen(false); setGridPop(false); setRenaming(null); } };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  // aggregate running / failed across ALL groups for the bar pill + activity panel
  const allKeys = groups.flatMap((g, gi) => g.slots.filter(Boolean).map((k) => ({ ...k, _group: g.name, _gi: gi })));
  const runningCount = allKeys.filter((k) => k.state === "running").length;
  const panelItems = [
    ...allKeys.filter((k) => k.state === "running" || k.state === "failed"),
    ...allKeys.filter((k) => k.failedDot && k.state !== "failed" && k.state !== "running").map((k) => ({ ...k, state: "failed", ranFor: 0, exit: k.exit || 1 })),
  ];

  // window sizing
  const PAD = 22, BAR = 52, TABS = 40;
  const winW = PAD * 2 + cols * t.keySize + (cols - 1) * t.gap;
  const winH = BAR + TABS + PAD * 2 + rows * t.keySize + (rows - 1) * t.gap;
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const recalc = () => {
      const s = Math.min(1.35, (window.innerWidth - 80) / winW, (window.innerHeight - 80) / winH);
      setScale(Math.max(0.4, s));
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [winW, winH]);

  return (
    <div className="dp-stage" style={{ background: surf.wall }}>
      <div className="dp-window" style={{
        width: winW, height: winH, transform: `scale(${scale})`,
        background: surf.bg, borderRadius: 20,
        "--accent": accent, "--key": surf.key, "--key-hi": surf.keyHi,
        "--glow": t.glow, "--radius": t.radius + "px",
      }}>
        {/* top bar */}
        <div className="dp-bar" style={{ height: BAR }}>
          <div className="dp-brand">
            <span className="dp-mark" style={{ background: accent }}><DeckIcon name="bolt" size={13} style={{ color: "#0b0b0d" }} /></span>
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
              <button className={"dp-icon-btn" + (gridPop ? " is-active" : "")} onClick={() => setGridPop((p) => !p)} title="Grid size">
                <DeckIcon name="app" size={17} /><span className="dp-grid-label">{cols}×{rows}</span>
              </button>
              {gridPop && (
                <div className="dp-grid-pop">
                  <div className="dp-pop-row"><span>Columns</span><Stepper value={cols} min={2} max={6} onChange={(v) => setTweak("cols", v)} suffix="" /></div>
                  <div className="dp-pop-row"><span>Rows</span><Stepper value={rows} min={2} max={5} onChange={(v) => setTweak("rows", v)} suffix="" /></div>
                </div>
              )}
            </div>
            <button className={"dp-icon-btn" + (editMode ? " is-active" : "")} onClick={() => setEditMode((e2) => !e2)} title="Edit layout">
              <DeckIcon name="pencil" size={17} />
            </button>
            <button className={"dp-icon-btn" + (settingsOpen ? " is-active" : "")} onClick={(e) => { e.stopPropagation(); setSettingsOpen((o) => !o); }} title="Settings">
              <DeckIcon name="gear" size={18} />
            </button>
          </div>
        </div>

        {/* group tabs */}
        <div className="dp-tabs" style={{ height: TABS }} onClick={(e) => e.stopPropagation()}>
          <div className="dp-tabs-scroll">
            {groups.map((g, gi) => {
              const isActive = gi === active;
              const hasRunning = g.slots.some((k) => k && k.state === "running");
              const isRenaming = renaming && renaming.gi === gi;
              return (
                <div key={g.id} className={"dp-tab" + (isActive ? " is-active" : "")}
                  onClick={() => { setActive(gi); setRenaming(null); }}
                  onDoubleClick={() => setRenaming({ gi, value: g.name })}
                  title="Double-click to rename">
                  {hasRunning && <span className="dp-tab-dot" style={{ background: accent }} />}
                  {isRenaming ? (
                    <input className="dp-tab-input" autoFocus value={renaming.value}
                      onChange={(e) => setRenaming({ gi, value: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} />
                  ) : <span className="dp-tab-name">{g.name}</span>}
                  {editMode && groups.length > 1 && !isRenaming && (
                    <span className="dp-tab-del" role="button" aria-label="Delete group"
                      onClick={(e) => { e.stopPropagation(); deleteGroup(gi); }}><DeckIcon name="close" size={11} /></span>
                  )}
                </div>
              );
            })}
            <button className="dp-tab-add" onClick={addGroup} title="New group"><DeckIcon name="plus" size={15} /></button>
          </div>
          <span className="dp-tabs-count">{slots.filter(Boolean).length} action{slots.filter(Boolean).length === 1 ? "" : "s"}</span>
        </div>

        {/* grid */}
        <div className="dp-grid" key={groups[active] && groups[active].id} style={{
          gridTemplateColumns: `repeat(${cols}, ${t.keySize}px)`,
          gridTemplateRows: `repeat(${rows}, ${t.keySize}px)`,
          gap: t.gap, padding: PAD,
        }}>
          {slots.map((k, idx) => (
            <Key key={idx} k={k} idx={idx} now={now} accent={accent} editMode={editMode}
              showLabels={t.showLabels} pressed={pressed} dragOver={dragOver === idx}
              onPress={() => pressKey(idx)} onStop={() => stopKey(idx)}
              onContext={(e) => { e.preventDefault(); e.stopPropagation(); if (k) setMenu({ x: e.clientX, y: e.clientY, index: idx }); }}
              onDelete={() => setSlots((prev) => prev.map((s, j) => j === idx ? null : s))}
              onDragStart={() => { dragFrom.current = idx; }}
              onDragOver={(e) => { if (editMode && k) { e.preventDefault(); setDragOver(idx); } }}
              onDrop={() => onDrop(idx)} />
          ))}
        </div>

        <ActivityPanel open={panelOpen} items={panelItems} now={now} accent={accent}
          onStop={stopKeyById} onClose={() => setPanelOpen(false)} />
        <Settings open={settingsOpen}
          settings={{ cols, rows, accent, surface: t.surface, showLabels: t.showLabels, launchStartup: t.launchStartup, alwaysOnTop: t.alwaysOnTop }}
          onChange={(patch) => { Object.entries(patch).forEach(([kk, vv]) => setTweak(kk, vv)); }}
          onClose={() => setSettingsOpen(false)} />
      </div>

      <div className="dp-toast-layer" style={{ transform: `scale(${scale})` }}>
        <Toast toast={toast} onView={() => { setPanelOpen(true); setToast(null); }} onClose={() => setToast(null)} />
      </div>

      <ContextMenu menu={menu} onEdit={ctxEdit} onDuplicate={ctxDuplicate} onDelete={ctxDelete} />
      <EditModal open={!!modal} draft={modal && modal.draft} accent={accent} onSave={saveModal} onCancel={() => setModal(null)} />

      <DeckTweaks t={t} setTweak={setTweak} />
    </div>
  );
}

window.App = App;
