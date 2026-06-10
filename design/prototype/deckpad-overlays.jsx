// deckpad-overlays.jsx — presentational overlay surfaces for DeckPad.
// Activity panel, Add/Edit modal, Settings sheet, context menu, toast.
const DeckIcon = window.DeckIcon;
const { useState, useEffect, useRef } = React;

function fmtElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ---------- Toast ---------- */
function Toast({ toast, onView, onClose }) {
  if (!toast) return null;
  return (
    <div className="dp-toast" role="status">
      <span className="dp-toast-dot" />
      <div className="dp-toast-body">
        <div className="dp-toast-title">{toast.label} failed <span className="dp-toast-exit">(exit {toast.exit})</span></div>
        <button className="dp-toast-link" onClick={onView}>View log</button>
      </div>
      <button className="dp-toast-x" onClick={onClose} aria-label="Dismiss"><DeckIcon name="close" size={14} /></button>
    </div>
  );
}

/* ---------- Activity panel ---------- */
function ActivityPanel({ open, items, now, accent, onStop, onClose }) {
  const scrollRefs = useRef({});
  useEffect(() => {
    Object.values(scrollRefs.current).forEach((el) => { if (el) el.scrollTop = el.scrollHeight; });
  });
  return (
    <div className={"dp-panel" + (open ? " is-open" : "")}>
      <div className="dp-panel-head">
        <div className="dp-panel-title">Activity</div>
        <button className="dp-icon-btn" onClick={onClose} aria-label="Close"><DeckIcon name="chevronDown" size={18} /></button>
      </div>
      <div className="dp-panel-list">
        {items.length === 0 && <div className="dp-panel-empty">Nothing running. Press a key to launch an action.</div>}
        {items.map((it) => {
          const failed = it.state === "failed";
          const elapsed = failed ? it.ranFor : Math.max(0, (now - it.startedAt) / 1000);
          return (
            <div className="dp-act" key={it.id}>
              <div className="dp-act-top">
                <span className={"dp-act-icon" + (failed ? " is-failed" : "")}
                  style={!failed ? { color: accent } : undefined}>
                  <DeckIcon name={it.icon} size={18} />
                </span>
                <div className="dp-act-meta">
                  <div className="dp-act-label">{it.label}{it._group && <span className="dp-act-group">{it._group}</span>}</div>
                  <div className="dp-act-sub">
                    {failed
                      ? <span className="dp-act-failtag">Failed · exit {it.exit}</span>
                      : <span className="dp-act-time"><span className="dp-run-dot" style={{ background: accent }} /> {fmtElapsed(elapsed)}</span>}
                  </div>
                </div>
                {failed
                  ? <span className="dp-act-cmd">{it.command}</span>
                  : <button className="dp-stop-btn" onClick={() => onStop(it.id)}><DeckIcon name="stop" size={11} /> Stop</button>}
              </div>
              <pre className="dp-act-log" ref={(el) => { scrollRefs.current[it.id] = el; }}>
                {(it.log || []).join("\n")}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Context menu ---------- */
function ContextMenu({ menu, onEdit, onDuplicate, onDelete }) {
  if (!menu) return null;
  return (
    <div className="dp-menu" style={{ left: menu.x, top: menu.y }}>
      <button className="dp-menu-item" onClick={onEdit}><DeckIcon name="pencil" size={16} /> Edit</button>
      <button className="dp-menu-item" onClick={onDuplicate}><DeckIcon name="copy" size={16} /> Duplicate</button>
      <div className="dp-menu-sep" />
      <button className="dp-menu-item is-danger" onClick={onDelete}><DeckIcon name="trash" size={16} /> Delete</button>
    </div>
  );
}

/* ---------- Settings sheet ---------- */
const ACCENTS = ["#34D399", "#0E5ECF", "#22D3EE", "#8B5CF6", "#F59E0B", "#F04438"];
const SURFACE_OPTS = [
  { id: "near-black", name: "Near-black", bg: "#0E0E10", key: "#1A1A1E" },
  { id: "charcoal", name: "Charcoal", bg: "#161619", key: "#202026" },
  { id: "ink-blue", name: "Ink blue", bg: "#0B0F17", key: "#161C28" },
];
function Settings({ open, settings, onChange, onClose }) {
  return (
    <div className={"dp-sheet" + (open ? " is-open" : "")}>
      <div className="dp-sheet-head">
        <div className="dp-panel-title">Settings</div>
        <button className="dp-icon-btn" onClick={onClose} aria-label="Close"><DeckIcon name="close" size={18} /></button>
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
              <button key={c} className={"dp-swatch" + (settings.accent === c ? " is-on" : "")}
                style={{ background: c }} onClick={() => onChange({ accent: c })} aria-label={c}>
                {settings.accent === c && <DeckIcon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
        <div className="dp-field">
          <label className="dp-field-label">Background</label>
          <div className="dp-surf-opts">
            {SURFACE_OPTS.map((s) => (
              <button key={s.id} className={"dp-surf-opt" + (settings.surface === s.id ? " is-on" : "")}
                onClick={() => onChange({ surface: s.id })}>
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

function Stepper({ value, min, max, onChange, suffix }) {
  return (
    <div className="dp-stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease"><DeckIcon name="minimize" size={14} /></button>
      <span className="dp-stepper-val">{value}<em>{suffix}</em></span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase"><DeckIcon name="plus" size={14} /></button>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <button className="dp-toggle-row" onClick={() => onChange(!value)}>
      <span>{label}</span>
      <span className={"dp-switch" + (value ? " is-on" : "")}><span className="dp-switch-knob" /></span>
    </button>
  );
}

window.fmtElapsed = fmtElapsed;
Object.assign(window, { Toast, ActivityPanel, ContextMenu, Settings, Stepper, ToggleRow, DECK_ACCENTS: ACCENTS });
