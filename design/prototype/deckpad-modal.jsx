// deckpad-modal.jsx — Add / Edit action modal.
const DeckIcon = window.DeckIcon;
const { useState, useEffect, useRef } = React;

const TILE_COLORS = ["#34D399", "#0E5ECF", "#22D3EE", "#8B5CF6", "#F59E0B", "#F04438", "#64748B", "#EC4899"];
const EMOJIS = ["🚀", "🛠", "📦", "🗄", "🔥", "⚡️", "🎯", "📸", "🧪", "☁️", "🔑", "🎧"];
// Simulated file system the picker chooses from — picking one auto-detects an icon.
const FAKE_FILES = {
  command: [
    { path: "~/dev/acme-web", icon: "code", label: "acme-web" },
    { path: "/usr/local/bin/deploy.sh", icon: "rocket", label: "deploy.sh" },
    { path: "~/scripts/backup-db.sh", icon: "database", label: "backup-db.sh" },
  ],
  file: [
    { path: "~/Documents/Q3-Roadmap.pdf", icon: "file", label: "Q3-Roadmap.pdf" },
    { path: "~/Downloads", icon: "folder", label: "Downloads" },
    { path: "~/Pictures/hero-render.png", icon: "image", label: "hero-render.png" },
  ],
  app: [
    { path: "/Applications/Visual Studio Code.app", icon: "code", label: "Visual Studio Code" },
    { path: "/Applications/Figma.app", icon: "pencil", label: "Figma" },
    { path: "/Applications/Spotify.app", icon: "music", label: "Spotify" },
  ],
};

function EditModal({ open, draft, accent, onSave, onCancel }) {
  const [d, setD] = useState(draft);
  const [picker, setPicker] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  useEffect(() => { if (open) { setD(draft); setPicker(false); setEmojiOpen(false); } }, [open, draft]);
  if (!open || !d) return null;
  const set = (patch) => setD((p) => ({ ...p, ...patch }));
  const isNew = d.isNew;

  const chooseFile = (f) => {
    set({ path: f.path, label: d.label || f.label, icon: f.icon, iconKind: "auto", autoFrom: f.label });
    setPicker(false);
  };

  const previewTile = () => {
    const k = d.iconKind || "auto";
    if (k === "letter") {
      return <div className="dp-prev-tile" style={{ background: d.tileColor || accent }}>
        <span className="dp-prev-letter">{(d.label || "?").trim().charAt(0).toUpperCase() || "?"}</span></div>;
    }
    if (k === "emoji") {
      return <div className="dp-prev-tile dp-prev-tile--key"><span className="dp-prev-emoji">{d.emoji || "🚀"}</span></div>;
    }
    if (k === "image") {
      return <div className="dp-prev-tile" style={{ background: "linear-gradient(135deg,#3b3b42,#23232a)" }}><DeckIcon name="image" size={26} style={{ color: "#A3A3AD" }} /></div>;
    }
    // auto
    return <div className="dp-prev-tile dp-prev-tile--key" style={{ color: accent }}><DeckIcon name={d.icon || "app"} size={28} /></div>;
  };

  return (
    <div className="dp-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dp-modal" role="dialog" aria-modal="true">
        <div className="dp-modal-head">
          <div className="dp-modal-title">{isNew ? "Add action" : "Edit action"}</div>
          <button className="dp-icon-btn" onClick={onCancel} aria-label="Close"><DeckIcon name="close" size={18} /></button>
        </div>

        <div className="dp-modal-body">
          <div className="dp-field">
            <label className="dp-field-label">Label</label>
            <input className="dp-input" value={d.label || ""} placeholder="e.g. Dev Server"
              onChange={(e) => set({ label: e.target.value })} autoFocus />
          </div>

          <div className="dp-field">
            <label className="dp-field-label">Action type</label>
            <div className="dp-seg">
              {[["command", "Run command"], ["file", "Open file"], ["app", "Launch app"]].map(([v, lbl]) => (
                <button key={v} className={"dp-seg-btn" + (d.type === v ? " is-on" : "")}
                  onClick={() => set({ type: v, path: "", autoFrom: null })}>{lbl}</button>
              ))}
            </div>
          </div>

          {d.type === "command" ? (
            <>
              <div className="dp-field">
                <label className="dp-field-label">Command</label>
                <textarea className="dp-input dp-mono dp-textarea" rows={2} spellCheck={false}
                  value={d.command || ""} placeholder="npm run dev"
                  onChange={(e) => set({ command: e.target.value })} />
              </div>
              <div className="dp-field">
                <label className="dp-field-label">Working directory <span className="dp-opt">optional</span></label>
                <input className="dp-input dp-mono" value={d.cwd || ""} placeholder="~/dev/acme-web"
                  onChange={(e) => set({ cwd: e.target.value })} />
              </div>
              <ToggleRow label="Show terminal window" value={!!d.showTerminal} onChange={(v) => set({ showTerminal: v })} />
            </>
          ) : (
            <div className="dp-field">
              <label className="dp-field-label">{d.type === "app" ? "Application" : "File"}</label>
              <div className="dp-picker">
                <button className="dp-file-row" onClick={() => setPicker((p) => !p)}>
                  <DeckIcon name={d.path ? d.icon : (d.type === "app" ? "app" : "folderOpen")} size={18}
                    style={{ color: d.path ? accent : "#7A7A86" }} />
                  <span className={d.path ? "dp-file-path" : "dp-file-path is-placeholder"}>
                    {d.path || `Choose ${d.type === "app" ? "an application" : "a file"}…`}</span>
                  <DeckIcon name="chevronDown" size={16} style={{ color: "#7A7A86", marginLeft: "auto" }} />
                </button>
                {picker && (
                  <div className="dp-picker-pop">
                    {FAKE_FILES[d.type].map((f) => (
                      <button key={f.path} className="dp-picker-item" onClick={() => chooseFile(f)}>
                        <DeckIcon name={f.icon} size={18} style={{ color: "#A3A3AD" }} />
                        <span><strong>{f.label}</strong><em>{f.path}</em></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Icon section */}
          <div className="dp-field">
            <label className="dp-field-label">Icon</label>
            <div className="dp-icon-section">
              <div className="dp-prev-wrap">
                {previewTile()}
                {d.iconKind === "auto" && d.autoFrom && <span className="dp-auto-badge">Auto from file</span>}
              </div>
              <div className="dp-icon-controls">
                <div className="dp-icon-btns">
                  <button className={"dp-mini-btn" + (d.iconKind === "image" ? " is-on" : "")}
                    onClick={() => set({ iconKind: "image" })}><DeckIcon name="image" size={15} /> Choose image…</button>
                  <button className={"dp-mini-btn" + (d.iconKind === "emoji" ? " is-on" : "")}
                    onClick={() => { set({ iconKind: "emoji", emoji: d.emoji || "🚀" }); setEmojiOpen((o) => !o); }}>
                    <DeckIcon name="smile" size={15} /> Pick emoji</button>
                  <button className={"dp-mini-btn" + (d.iconKind === "letter" ? " is-on" : "")}
                    onClick={() => set({ iconKind: "letter", tileColor: d.tileColor || accent })}>
                    <DeckIcon name="type" size={15} /> Letter tile</button>
                </div>
                {emojiOpen && d.iconKind === "emoji" && (
                  <div className="dp-emoji-grid">
                    {EMOJIS.map((e) => (
                      <button key={e} className={"dp-emoji-cell" + (d.emoji === e ? " is-on" : "")}
                        onClick={() => set({ emoji: e })}>{e}</button>
                    ))}
                  </div>
                )}
                {(d.iconKind === "letter" || d.iconKind === "emoji") && (
                  <div className="dp-swatches dp-swatches--sm">
                    {TILE_COLORS.map((c) => (
                      <button key={c} className={"dp-swatch dp-swatch--sm" + (d.tileColor === c ? " is-on" : "")}
                        style={{ background: c }} onClick={() => set({ tileColor: c })} aria-label={c}>
                        {d.tileColor === c && <DeckIcon name="check" size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="dp-modal-foot">
          <button className="dp-btn dp-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="dp-btn dp-btn--primary" style={{ background: accent }}
            disabled={!(d.label || "").trim()} onClick={() => onSave(d)}>Save action</button>
        </div>
      </div>
    </div>
  );
}

window.EditModal = EditModal;
