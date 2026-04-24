export const STYLES = `
:host, * {
  box-sizing: border-box;
}

:host {
  --bg: rgba(15, 15, 17, 0.86);
  --surface-0: rgba(255, 255, 255, 0.02);
  --surface-1: rgba(255, 255, 255, 0.04);
  --surface-2: rgba(255, 255, 255, 0.08);
  --surface-3: rgba(255, 255, 255, 0.14);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --border-subtle: rgba(255, 255, 255, 0.05);
  --fg: rgb(244, 244, 247);
  --fg-muted: rgb(180, 180, 190);
  --fg-subtle: rgb(140, 140, 150);
  --fg-faint: rgb(110, 110, 120);
  --accent: rgb(129, 140, 248);
  --accent-strong: rgb(99, 102, 241);
  --accent-soft: rgba(99, 102, 241, 0.14);
  --accent-ring: rgba(129, 140, 248, 0.55);
  --success: rgb(34, 197, 94);
  --success-fg: rgb(134, 239, 172);
  --warn: rgb(250, 204, 21);
  --warn-fg: rgb(253, 224, 71);
  --danger: rgb(248, 113, 113);
  --danger-fg: rgb(252, 165, 165);
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms;
  --dur: 160ms;
  --dur-slow: 220ms;
  --radius-sm: 4px;
  --radius: 6px;
  --radius-lg: 8px;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.host {
  position: fixed;
  z-index: 2147483646;
  top: 0;
  left: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  will-change: transform;
  transition: transform var(--dur-slow) var(--ease);
  user-select: none;
  -webkit-user-select: none;
}
.host[data-dragging="true"] { transition: none; }

.shell {
  position: relative;
  background: var(--bg);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.04) inset,
    0 18px 48px -12px rgba(0, 0, 0, 0.55),
    0 8px 18px -8px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  transform-origin: var(--origin-x, 0%) var(--origin-y, 0%);
  transition: transform var(--dur-slow) var(--ease),
              opacity var(--dur) var(--ease);
}

.shell.collapsed { transform: scale(0.92); opacity: 0.97; }
.shell.expanded { transform: scale(1); opacity: 1; display: flex; flex-direction: column; }

/* ---------- Pill (collapsed) ---------- */

.pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px 7px 9px;
  cursor: grab;
  touch-action: none;
}
.pill:active { cursor: grabbing; }

.brand-mark {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: rgb(232, 232, 238);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.pill .brand-mark { width: 22px; height: 22px; }

.pill-meta { display: flex; flex-direction: column; min-width: 0; }
.pill-label { font-weight: 600; font-size: 11px; letter-spacing: 0.01em; line-height: 1.1; }
.pill-sub { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--fg-subtle); margin-top: 2px; line-height: 1; }

/* ---------- Header ---------- */

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: grab;
  touch-action: none;
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, rgba(255,255,255,0.025), transparent);
  flex-shrink: 0;
}
.header:active { cursor: grabbing; }
.header-title { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.title-text { font-weight: 600; font-size: 12px; letter-spacing: 0.01em; }
.header-actions { display: flex; align-items: center; gap: 4px; }

/* ---------- Icon button ---------- */

.icon-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease),
              color var(--dur-fast) var(--ease),
              transform var(--dur-fast) var(--ease);
}
.icon-btn:hover { background: var(--surface-2); color: var(--fg); }
.icon-btn:active { transform: scale(0.94); }
.icon-btn:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.icon-btn svg { width: 14px; height: 14px; }

/* ---------- Status dots ---------- */

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex-shrink: 0;
  position: relative;
}
.dot--mini { width: 5px; height: 5px; }
.dot::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.25;
  animation: pulse 1.6s ease-out infinite;
}
.dot--mini::after { inset: -2px; }
.dot--ok { background: var(--success); color: var(--success); }
.dot--warn { background: var(--warn); color: var(--warn); }
.dot--danger { background: var(--danger); color: var(--danger); }
.dot--idle { background: rgb(120, 120, 130); color: rgb(120, 120, 130); }
.dot--idle::after { animation: none; opacity: 0; }
.dot--mini.dot--ok::after, .dot--mini.dot--idle::after { animation: none; opacity: 0; }

@keyframes pulse {
  0% { transform: scale(0.6); opacity: 0.4; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* ---------- Panel shell ---------- */

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.panel-scroll::-webkit-scrollbar { width: 8px; }
.panel-scroll::-webkit-scrollbar-thumb { background: var(--surface-2); border-radius: 999px; }
.panel-scroll::-webkit-scrollbar-thumb:hover { background: var(--surface-3); }

.panel-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-0);
  font-size: 11.5px;
  color: var(--fg-muted);
}
.panel-status-label {
  font-weight: 600;
  color: rgb(232, 232, 238);
  letter-spacing: 0.04em;
  font-size: 10.5px;
  text-transform: uppercase;
}
.panel-status-sep { color: rgb(80, 80, 90); }
.panel-status-meta { font-variant-numeric: tabular-nums; }
.panel-status-warn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--warn);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.panel-status-warn svg { width: 12px; height: 12px; }

.panel-section { border-bottom: 1px solid var(--border-subtle); }
.panel-section:last-of-type { border-bottom: 0; }

.panel-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 8px;
}
.panel-section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-muted);
}
.panel-section-title svg { width: 12px; height: 12px; color: var(--fg-subtle); }
.panel-section-count {
  font-weight: 500;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  font-size: 10.5px;
  letter-spacing: 0;
  text-transform: none;
}

.panel-show-more {
  width: calc(100% - 24px);
  margin: 6px 12px 10px;
  justify-content: center;
}

.panel-advanced { background: rgba(0, 0, 0, 0.14); }
.panel-advanced > summary { color: var(--fg-muted); background: var(--surface-0); }

.panel-identity {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.panel-identity-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto auto;
  gap: 8px;
  align-items: center;
}
.panel-identity-label {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-subtle);
}
.panel-identity-value {
  font-family: var(--mono);
  font-size: 10.5px;
  color: rgb(232, 232, 238);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
  -webkit-user-select: text;
}
.panel-identity-age {
  font-size: 10.5px;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}

/* ---------- Generic row ---------- */

.section {
  padding: 12px 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.section:last-child { border-bottom: 0; }

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
}
.row + .row { border-top: 1px dashed var(--border-subtle); }
.row-label { color: var(--fg-muted); }
.row-value {
  color: var(--fg);
  font-variant-numeric: tabular-nums;
  max-width: 60%;
  text-align: right;
  word-break: break-all;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  user-select: text;
  -webkit-user-select: text;
}
.row-value.mono { font-family: var(--mono); font-size: 11px; }

/* ---------- Buttons ---------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--fg);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  transition: background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease),
              color var(--dur-fast) var(--ease),
              transform var(--dur-fast) var(--ease),
              box-shadow var(--dur-fast) var(--ease);
}
.btn:hover { background: var(--surface-2); border-color: var(--border-strong); }
.btn:active { transform: scale(0.97); }
.btn:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
.btn svg { width: 12px; height: 12px; flex-shrink: 0; }

.btn--primary {
  background: linear-gradient(180deg, rgb(99, 102, 241), rgb(79, 70, 229));
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 12px -4px rgba(99, 102, 241, 0.5);
}
.btn--primary:hover {
  background: linear-gradient(180deg, rgb(110, 113, 250), rgb(89, 80, 240));
  border-color: transparent;
  box-shadow: 0 6px 16px -4px rgba(99, 102, 241, 0.6);
}

.btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--fg-muted);
  padding: 0 8px;
  height: 26px;
}
.btn--ghost:hover { background: var(--surface-1); color: var(--fg); border-color: transparent; }

.btn--compact {
  height: 22px;
  padding: 0 7px;
  font-size: 10.5px;
  gap: 4px;
}
.btn--compact svg { width: 11px; height: 11px; }

.btn--danger { color: var(--danger-fg); border-color: rgba(248, 113, 113, 0.2); }
.btn--danger:hover { background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.32); }
.btn--ghost.btn--danger { border-color: transparent; }
.btn--ghost.btn--danger:hover { background: rgba(248, 113, 113, 0.1); border-color: transparent; }

/* ---------- Inputs ---------- */

.input {
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--fg);
  font-family: inherit;
  font-size: 11.5px;
  height: 28px;
  padding: 0 8px;
  width: 100%;
  outline: none;
  user-select: text;
  -webkit-user-select: text;
  transition: border-color var(--dur-fast) var(--ease),
              box-shadow var(--dur-fast) var(--ease),
              background var(--dur-fast) var(--ease);
}
.input:hover { border-color: var(--border-strong); }
.input:focus { border-color: var(--accent-strong); box-shadow: 0 0 0 3px var(--accent-soft); }
.input::placeholder { color: var(--fg-faint); }
.input.mono { font-family: var(--mono); }
textarea.input {
  height: auto;
  font-size: 10.5px;
  line-height: 1.5;
  padding: 6px 8px;
  resize: vertical;
}
select.input {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 26px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23b4b4be' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px 10px;
  cursor: pointer;
}

/* ---------- Checkbox (styled native) ---------- */

input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface-1);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}
input[type="checkbox"]:hover { border-color: var(--accent); }
input[type="checkbox"]:checked {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}
input[type="checkbox"]:checked::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'/></svg>");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px 10px;
}
input[type="checkbox"]:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 1px; }

/* ---------- Code block ---------- */

.code {
  margin: 0;
  padding: 10px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.55;
  color: rgb(190, 190, 200);
  max-height: 220px;
  overflow: auto;
  white-space: pre;
  user-select: text;
  -webkit-user-select: text;
}

/* ---------- Event row ---------- */

.event {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  transition: background var(--dur-fast) var(--ease);
}
.event:hover { background: var(--surface-0); }
.event-tag {
  display: inline-grid;
  place-items: center;
  padding: 2px 6px;
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-radius: var(--radius-sm);
  border: 1px solid;
  font-variant-numeric: tabular-nums;
}
.event-tag--track { color: rgb(165, 180, 252); border-color: rgba(165, 180, 252, 0.32); background: rgba(99, 102, 241, 0.12); }
.event-tag--screen_view { color: rgb(134, 239, 172); border-color: rgba(134, 239, 172, 0.32); background: rgba(34, 197, 94, 0.12); }
.event-tag--flush { color: rgb(186, 230, 253); border-color: rgba(186, 230, 253, 0.32); background: rgba(56, 189, 248, 0.12); }
.event-tag--clear { color: rgb(252, 165, 165); border-color: rgba(252, 165, 165, 0.32); background: rgba(248, 113, 113, 0.12); }
.event-tag--status { color: rgb(253, 224, 71); border-color: rgba(253, 224, 71, 0.32); background: rgba(250, 204, 21, 0.12); }

.event-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--fg);
  user-select: text;
  -webkit-user-select: text;
}
.event-time {
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--fg-subtle);
  font-family: var(--mono);
}
.event-payload {
  grid-column: 2 / 4;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
  user-select: text;
  -webkit-user-select: text;
}

/* ---------- Queue chips ---------- */

.queue-chip-group {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}
.queue-chip {
  padding: 8px 6px;
  text-align: center;
  border-radius: var(--radius);
  border: 1px solid var(--border-subtle);
  background: var(--surface-0);
}
.queue-chip-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.queue-chip-label {
  font-size: 9px;
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}
.queue-chip[data-flushing="true"] {
  border-color: rgba(99, 102, 241, 0.32);
  background: var(--accent-soft);
}
.queue-chip[data-flushing="true"] .queue-chip-count { color: rgb(199, 210, 254); }

/* ---------- Flag chips & badges ---------- */

.flag-key {
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--fg);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
  -webkit-user-select: text;
}

.flag-badges { display: inline-flex; align-items: center; gap: 6px; }
.flag-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flag-chip--on { color: var(--success-fg); background: rgba(34, 197, 94, 0.12); }
.flag-chip--off { color: var(--fg-muted); background: var(--surface-1); }
.flag-chip--override { color: rgb(199, 210, 254); background: rgba(99, 102, 241, 0.18); }
.flag-chip--variant {
  color: rgb(186, 230, 253);
  background: rgba(56, 189, 248, 0.1);
  font-size: 10px;
  font-weight: 500;
}

.flag-source-tag {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-subtle);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-0);
}
.flag-source-tag--override {
  color: rgb(199, 210, 254);
  border-color: rgba(99, 102, 241, 0.34);
  background: rgba(99, 102, 241, 0.1);
}
.flag-source-tag--error {
  color: var(--danger-fg);
  border-color: rgba(248, 113, 113, 0.28);
  background: rgba(248, 113, 113, 0.08);
}

.field-label {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--fg-subtle);
}

/* ---------- Shared utilities ---------- */

.fold-count {
  margin-left: auto;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.form-error {
  color: var(--danger-fg);
  font-size: 11px;
  margin-top: 6px;
}

.hint { font-size: 11px; color: var(--fg-faint); line-height: 1.45; }
.hint--error { color: var(--danger); }

.meta-text {
  font-size: 10px;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}

.scope-tag {
  display: inline-flex;
  align-items: center;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-subtle);
  padding: 1px 5px;
  margin-right: 6px;
  border-radius: 3px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-0);
}

.empty--compact {
  padding: 14px 16px;
  font-size: 11px;
  gap: 4px;
}
.empty--compact svg { width: 20px; height: 20px; }

.composer {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
}
.composer-field { flex: 1; min-width: 0; }

.fold-footer { padding: 0 12px 10px; }

.stacked { display: flex; flex-direction: column; gap: 8px; }

.composer-textarea { resize: vertical; min-height: 58px; }

/* ---------- Diagnostic items ---------- */

.diag {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.diag-icon { display: grid; place-items: center; padding-top: 1px; }
.diag-icon svg { width: 14px; height: 14px; }
.diag-icon--ok { color: rgb(74, 222, 128); }
.diag-icon--warn { color: var(--warn); }
.diag-icon--fail { color: var(--danger); }
.diag-icon--info { color: rgb(165, 180, 252); }
.diag-label { font-size: 12px; color: var(--fg); }
.diag-hint { font-size: 11px; color: var(--fg-subtle); margin-top: 2px; line-height: 1.45; }

.id-value--muted { color: var(--fg-subtle); }

/* ---------- Fold (collapsible) ---------- */

details.fold { border-top: 1px solid var(--border-subtle); }
details.fold > summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fg-subtle);
  list-style: none;
  transition: color var(--dur-fast) var(--ease);
}
details.fold > summary::-webkit-details-marker { display: none; }
details.fold > summary svg {
  width: 12px;
  height: 12px;
  transition: transform var(--dur) var(--ease);
}
details.fold[open] > summary svg { transform: rotate(90deg); }
details.fold > summary:hover { color: var(--fg); }

/* ---------- Action bar ---------- */

.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.24);
  flex-shrink: 0;
}
.action-bar-spacer { flex: 1; }

/* ---------- Empty state ---------- */

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 20px;
  color: var(--fg-subtle);
  font-size: 12px;
  text-align: center;
}
.empty svg { width: 28px; height: 28px; opacity: 0.45; }
.empty code { font-family: var(--mono); color: rgb(199, 210, 254); }

/* ---------- Resize handle ---------- */

.resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 2;
}
.resize::before {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 6px;
  height: 6px;
  border-right: 2px solid rgba(255, 255, 255, 0.18);
  border-bottom: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 0 0 2px 0;
  transition: border-color var(--dur-fast) var(--ease);
}
.resize:hover::before { border-color: rgba(255, 255, 255, 0.45); }

/* ---------- Switch toggle ---------- */

.switch {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  width: 28px;
  height: 16px;
  padding: 2px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--dur) var(--ease),
              border-color var(--dur) var(--ease),
              transform var(--dur-fast) var(--ease);
  flex-shrink: 0;
}
.switch:hover { background: var(--surface-3); }
.switch:active { transform: scale(0.96); }
.switch[data-checked="true"] { background: var(--success); border-color: var(--success); }
.switch[data-checked="true"][data-override="true"] { background: var(--accent-strong); border-color: var(--accent-strong); }
.switch[data-checked="false"][data-override="true"] { background: rgba(99, 102, 241, 0.28); border-color: rgba(99, 102, 241, 0.5); }
.switch-knob {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform var(--dur) var(--ease);
}
.switch[data-checked="true"] .switch-knob { transform: translateX(12px); }
.switch:focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }

/* ---------- Flag row ---------- */

.flag-lite {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background var(--dur-fast) var(--ease);
}
.flag-lite:last-child { border-bottom: 0; }
.flag-lite:hover { background: var(--surface-0); }
.flag-lite[data-override="true"] { background: rgba(99, 102, 241, 0.05); }
.flag-lite[data-override="true"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
}
.flag-lite-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.flag-lite-error {
  grid-column: 1 / -1;
  margin-top: 4px;
}

.flag-advanced {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: end;
  margin-top: 6px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius);
  border: 1px dashed var(--border-subtle);
}
.flag-advanced-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.flag-advanced-actions { display: flex; gap: 4px; }

.flag-lite--unavailable { opacity: 0.55; }
.flag-lite--unavailable:hover { background: var(--surface-0); }
.flag-desc {
  grid-column: 2 / -1;
  font-size: 11px;
  color: var(--fg-faint);
  margin-top: 2px;
}
.switch--disabled { cursor: not-allowed; background: var(--surface-1); opacity: 0.6; }
.flag-chip--muted { background: var(--surface-1); color: var(--fg-faint); }
.flag-source-tag--unavailable {
  background: var(--surface-0);
  color: var(--fg-faint);
  border: 1px dashed var(--border);
}
.flag-source-tag--ghost {
  background: rgba(245, 158, 11, 0.08);
  color: rgb(245, 158, 11);
  border: 1px dashed rgba(245, 158, 11, 0.3);
}
.flag-lite[data-ghost="true"] { background: rgba(245, 158, 11, 0.02); }

/* ---------- Flag manage / new forms ---------- */

.flag-manage {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius);
  border: 1px solid var(--border-subtle);
}
.flag-manage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.flag-manage-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--fg-muted);
  cursor: pointer;
}
.flag-manage-label select.input { width: auto; }
.flag-manage-type {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fg-faint);
  padding: 2px 6px;
  background: var(--surface-1);
  border-radius: 3px;
}
.flag-manage-variants {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--surface-0);
  border-radius: var(--radius-sm);
}
.flag-manage-variant {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 6px;
  align-items: center;
}

.flag-new {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin: 0 12px 10px;
  background: rgba(0, 0, 0, 0.28);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
.flag-new-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

/* ---------- Flag admin strip ---------- */

.flag-admin-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  margin: 0 12px 8px;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
}
.flag-admin-strip--cta {
  background: var(--accent-soft);
  border-color: rgba(99, 102, 241, 0.28);
}
.flag-admin-strip--error {
  background: rgba(248, 113, 113, 0.06);
  border-color: rgba(248, 113, 113, 0.22);
}
.flag-admin-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--fg-muted);
  min-width: 0;
}
.flag-admin-label svg { width: 12px; height: 12px; color: var(--fg-subtle); }
.flag-admin-strip--error .flag-admin-label { color: var(--danger-fg); }

.flag-admin-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin: 0 12px 8px;
  background: rgba(0, 0, 0, 0.28);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}
`;
