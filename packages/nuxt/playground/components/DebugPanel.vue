<!--
  DebugPanel — floating overlay that shows all Databuddy events in real time.

  State is shared via Nuxt's useState:
    "db-debug-events"  — event list populated by plugins/01.debug-interceptor
    "db-debug-globals" — current setGlobalProperties() state

  This component is purely a display layer; all interception logic lives in
  plugins/01.debug-interceptor.client.ts and nuxt.config.ts.
-->
<script setup lang="ts">
interface DebugEvent {
	name: string;
	properties: Record<string, unknown>;
	time: string;
}

const events = useState<DebugEvent[]>("db-debug-events", () => []);
const globals = useState<Record<string, unknown>>(
	"db-debug-globals",
	() => ({})
);
const isOpen = ref(true);

const hasGlobals = computed(() => Object.keys(globals.value).length > 0);
const hasProps = (ev: DebugEvent) => Object.keys(ev.properties).length > 0;

function clear() {
	events.value = [];
	globals.value = {};
	if (window.__dbDebug) {
		window.__dbDebug.events = [];
		window.__dbDebug.globals = {};
	}
}
</script>

<template>
	<div class="panel" :class="{ collapsed: !isOpen }">
		<!-- Header — click anywhere to collapse/expand -->
		<div
			class="panel-header"
			role="button"
			tabindex="0"
			@click="isOpen = !isOpen"
			@keydown.enter.self.prevent="isOpen = !isOpen"
			@keydown.space.self.prevent="isOpen = !isOpen"
		>
			<span class="panel-title">
				<span class="dot" />
				Databuddy Debug
			</span>
			<span class="panel-meta">
				<span v-if="events.length > 0" class="badge">{{ events.length }}</span>
				<button
					v-if="events.length > 0"
					type="button"
					class="clear-btn"
					@click.stop="clear"
					@keydown.enter.stop.prevent
				>
					Clear
				</button>
				<span class="toggle">{{ isOpen ? "▾" : "▴" }}</span>
			</span>
		</div>

		<div v-if="isOpen" class="panel-body">
			<!-- Active global properties set via setGlobalProperties() -->
			<div v-if="hasGlobals" class="globals-bar">
				<span class="globals-label">globals</span>
				<span v-for="(val, key) in globals" :key="key" class="globals-chip">
					{{ key }}: {{ val }}
				</span>
			</div>

			<div v-if="events.length === 0" class="empty">
				No events yet — interact with the page to see them here.
			</div>

			<div v-else class="event-list">
				<div v-for="(ev, i) in events" :key="i" class="event-row">
					<div class="event-top">
						<span class="event-name">{{ ev.name }}</span>
						<span class="event-time">{{ ev.time }}</span>
					</div>
					<pre v-if="hasProps(ev)" class="event-props">{{ JSON.stringify(ev.properties, null, 2) }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.panel {
	position: fixed;
	bottom: 16px;
	right: 16px;
	width: 380px;
	max-height: 500px;
	background: #0f0f0f;
	color: #e8e8e8;
	border-radius: 10px;
	font-family: ui-monospace, "Cascadia Code", "Fira Mono", monospace;
	font-size: 12px;
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.4),
		0 0 0 1px rgba(255, 255, 255, 0.06);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	z-index: 9999;
}

.panel.collapsed {
	max-height: none;
}

.panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 14px;
	cursor: pointer;
	user-select: none;
	border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	flex-shrink: 0;
}

.panel-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
	font-size: 11px;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: #a3a3a3;
}

.dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: #22c55e;
	animation: pulse 2s infinite;
}

@keyframes pulse {
	0%,
	100% { opacity: 1; }
	50% { opacity: 0.4; }
}

.panel-meta {
	display: flex;
	align-items: center;
	gap: 8px;
}

.badge {
	background: #27272a;
	border: 1px solid rgba(255, 255, 255, 0.08);
	color: #a3a3a3;
	padding: 1px 7px;
	border-radius: 999px;
	font-size: 11px;
	font-weight: 600;
}

.clear-btn {
	background: none;
	border: 1px solid rgba(255, 255, 255, 0.1);
	color: #a3a3a3;
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 4px;
	cursor: pointer;
	font-family: inherit;
}

.clear-btn:hover {
	background: rgba(255, 255, 255, 0.06);
	color: #e8e8e8;
}

.toggle {
	color: #666;
	font-size: 10px;
}

.panel-body {
	overflow-y: auto;
	flex: 1;
}

.globals-bar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	padding: 8px 12px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	background: rgba(234, 179, 8, 0.06);
}

.globals-label {
	font-size: 10px;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: #ca8a04;
	font-weight: 600;
}

.globals-chip {
	font-size: 11px;
	background: rgba(234, 179, 8, 0.12);
	border: 1px solid rgba(234, 179, 8, 0.2);
	color: #fbbf24;
	padding: 1px 7px;
	border-radius: 999px;
}

.empty {
	padding: 24px 16px;
	text-align: center;
	color: #555;
	font-size: 12px;
	line-height: 1.6;
}

.event-list {
	padding: 6px;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.event-row {
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.06);
	border-radius: 6px;
	padding: 8px 10px;
}

.event-top {
	display: flex;
	align-items: baseline;
	gap: 6px;
}

.event-name {
	color: #7dd3fc;
	font-weight: 600;
	font-size: 12px;
	flex: 1;
}

.event-time {
	color: #525252;
	font-size: 10px;
	flex-shrink: 0;
}

.event-props {
	margin: 6px 0 0;
	padding: 6px 8px;
	background: rgba(0, 0, 0, 0.3);
	border-radius: 4px;
	color: #a3a3a3;
	font-size: 11px;
	white-space: pre;
	overflow-x: auto;
	line-height: 1.5;
}
</style>
