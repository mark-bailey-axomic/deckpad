// deckpad-key.jsx — single deck key (all 5 states) + the Tweaks panel content.
const DeckIcon = window.DeckIcon;
const { fmtElapsed } = window;
const { useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakColor } = window;

function KeyGlyph({ k, accent }) {
  const kind = k.iconKind || "auto";
  if (kind === "letter") return <span className="dp-key-letter" style={{ background: k.tileColor || accent }}>{(k.label || "?").trim().charAt(0).toUpperCase() || "?"}</span>;
  if (kind === "emoji") return <span className="dp-key-emoji">{k.emoji || "🚀"}</span>;
  if (kind === "image") return <span className="dp-key-img"><DeckIcon name="image" size={28} /></span>;
  return <DeckIcon name={k.icon || "app"} size={30} />;
}

function Key({ k, idx, now, accent, editMode, showLabels, pressed, dragOver,
  onPress, onStop, onContext, onDelete, onDragStart, onDragOver, onDrop }) {

  // empty slot
  if (!k) {
    return (
      <button className="dp-key dp-key--empty" onClick={onPress} onContextMenu={(e) => e.preventDefault()}
        onDragOver={onDragOver} onDrop={onDrop}>
        <span className="dp-empty-plus"><DeckIcon name="plus" size={22} /></span>
      </button>
    );
  }

  const st = k.state;
  const elapsed = st === "running" && k.startedAt ? Math.max(0, (now - k.startedAt) / 1000) : 0;
  const isPressed = pressed === k.id;

  return (
    <button
      className={[
        "dp-key", "dp-key--filled", `is-${st}`,
        isPressed ? "is-pressed" : "", editMode ? "is-edit" : "", dragOver ? "is-dragover" : "",
      ].join(" ")}
      style={{ "--accent": accent }}
      draggable={editMode}
      onClick={onPress}
      onContextMenu={onContext}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className="dp-key-inner">
        {/* status dot (running) / fail dot */}
        {st === "running" && <span className="dp-key-status" style={{ background: accent }} />}
        {k.failedDot && st !== "running" && <span className="dp-key-faildot" />}

        <span className="dp-key-glyph">
          <KeyGlyph k={k} accent={accent} />
        </span>

        {showLabels && (
          <span className="dp-key-label">
            {st === "running"
              ? <span className="dp-key-timer">▶ {fmtElapsed(elapsed)}</span>
              : k.label}
          </span>
        )}

        {/* stop overlay (running, on hover) */}
        {st === "running" && (
          <span className="dp-key-stop" onClick={(e) => { e.stopPropagation(); onStop(); }} role="button" aria-label="Stop">
            <DeckIcon name="stop" size={22} />
          </span>
        )}

        {/* launching shimmer */}
        {st === "launching" && <span className="dp-key-shimmer" />}
      </span>

      {/* edit-mode delete badge */}
      {editMode && (
        <span className="dp-key-del" onClick={(e) => { e.stopPropagation(); onDelete(); }} role="button" aria-label="Delete">
          <DeckIcon name="close" size={12} />
        </span>
      )}
    </button>
  );
}

/* ---------------- Tweaks panel ---------------- */
function DeckTweaks({ t, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Keys" />
      <TweakColor label="Accent" value={t.accent}
        options={["#34D399", "#0E5ECF", "#22D3EE", "#8B5CF6", "#F59E0B", "#F04438"]}
        onChange={(v) => setTweak("accent", v)} />
      <TweakSlider label="Key size" value={t.keySize} min={84} max={128} step={2} unit="px"
        onChange={(v) => setTweak("keySize", v)} />
      <TweakSlider label="Corner radius" value={t.radius} min={6} max={30} unit="px"
        onChange={(v) => setTweak("radius", v)} />
      <TweakSlider label="Gap" value={t.gap} min={8} max={26} unit="px"
        onChange={(v) => setTweak("gap", v)} />
      <TweakSlider label="Glow intensity" value={t.glow} min={0} max={1} step={0.05}
        onChange={(v) => setTweak("glow", v)} />
      <TweakToggle label="Show labels" value={t.showLabels} onChange={(v) => setTweak("showLabels", v)} />

      <TweakSection label="Surface" />
      <TweakRadio label="Background" value={t.surface}
        options={["near-black", "charcoal", "ink-blue"]}
        onChange={(v) => setTweak("surface", v)} />

      <TweakSection label="Grid" />
      <TweakSlider label="Columns" value={t.cols} min={2} max={6}
        onChange={(v) => setTweak("cols", v)} />
      <TweakSlider label="Rows" value={t.rows} min={2} max={5}
        onChange={(v) => setTweak("rows", v)} />

      <TweakSection label="Behaviour" />
      <TweakToggle label="Launch at startup" value={t.launchStartup} onChange={(v) => setTweak("launchStartup", v)} />
      <TweakToggle label="Always on top" value={t.alwaysOnTop} onChange={(v) => setTweak("alwaysOnTop", v)} />
    </TweaksPanel>
  );
}

Object.assign(window, { Key, KeyGlyph, DeckTweaks });
