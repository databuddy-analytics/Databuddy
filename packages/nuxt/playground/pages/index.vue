<script setup lang="ts">
const { track, trackError, setGlobalProperties, clear } = useDatabuddy();

// Feature flags — useFlag is auto-imported.
// With a fake clientId the API call fails gracefully: flags start as
// { loading: true } then settle to { on: false, status: "error" }.
// This is useful for testing your loading/fallback UI without a real account.
const flags = [
	{ key: "new-ui", state: useFlag("new-ui") },
	{ key: "dark-mode", state: useFlag("dark-mode") },
	{ key: "beta-feature", state: useFlag("beta-feature") },
];

function sendCustomEvent() {
	track("button_clicked", {
		label: "Send custom event",
		source: "playground",
	});
}

function sendErrorEvent() {
	trackError("Something went wrong", {
		filename: "playground/index.vue",
		error_type: "manual_test",
	});
}

function triggerVueError() {
	throw new Error("Intentional Vue render error for testing");
}

function setGlobals() {
	setGlobalProperties({
		plan: "pro",
		user_role: "admin",
	});
	track("globals_set", { plan: "pro" });
}

function resetSession() {
	clear();
	track("session_reset");
}
</script>

<template>
	<div class="page">
		<header class="header">
			<h1>@databuddy/nuxt playground</h1>
			<p>
				All outgoing events are intercepted by the debug panel — no backend
				needed.
			</p>
			<nav class="nav">
				<NuxtLink to="/">Home</NuxtLink>
				<NuxtLink to="/about">About</NuxtLink>
				<NuxtLink to="/contact">Contact</NuxtLink>
			</nav>
		</header>

		<main class="main">
			<section class="section">
				<h2>Custom Events</h2>
				<p>
					Track custom events with arbitrary properties. The event name and
					payload appear in the debug panel instantly.
				</p>
				<div class="actions">
					<button type="button" class="btn primary" @click="sendCustomEvent">
						Track custom event
					</button>
					<button type="button" class="btn" @click="setGlobals">
						Set global properties
					</button>
					<button type="button" class="btn" @click="resetSession">
						Reset session
					</button>
				</div>
			</section>

			<section class="section">
				<h2>Error Tracking</h2>
				<p>
					<code>trackErrors: true</code> auto-captures Vue errors via the
					<code>vue:error</code> hook. You can also call
					<code>trackError()</code> manually.
				</p>
				<div class="actions">
					<button type="button" class="btn" @click="sendErrorEvent">
						Track error manually
					</button>
					<button type="button" class="btn danger" @click="triggerVueError">
						Trigger Vue error
					</button>
				</div>
			</section>

			<section class="section">
				<h2>SPA Navigation</h2>
				<p>
					Navigate between pages using the links above. A
					<code>screen_view</code> event fires automatically on every route
					change — no <code>app.vue</code> edits needed.
				</p>
			</section>

			<section class="section">
				<h2>Options API &amp; template access</h2>
				<p>
					<code>$databuddy</code> is available directly in templates — no
					import needed.
				</p>
				<button
					type="button"
					class="btn"
					@click="$databuddy.track('template_click')"
				>
					Track via $databuddy
				</button>
			</section>

			<section class="section">
				<h2>Feature Flags</h2>
				<p>
					<code>useFlag</code> is auto-imported. With the fake playground
					<code>clientId</code>, the API call fails gracefully — flags start as
					<code>loading</code>, then settle to <code>on: false</code>. This lets
					you test your loading states and fallback UI without a real account.
				</p>
				<div class="flag-grid">
					<div v-for="flag in flags" :key="flag.key" class="flag-row">
						<div class="flag-info">
							<span class="flag-key">{{ flag.key }}</span>
							<span class="flag-status" :class="flag.state.loading ? 'loading' : flag.state.on ? 'on' : 'off'">
								{{ flag.state.loading ? 'loading…' : flag.state.on ? 'on' : 'off' }}
							</span>
						</div>
					</div>
				</div>
			</section>

			<section class="section">
				<h2>External link</h2>
				<p>
					With <code>trackOutgoingLinks: true</code>, clicks on external links
					are automatically tracked.
				</p>
				<a href="https://databuddy.cc" target="_blank" rel="noopener">
					databuddy.cc ↗
				</a>
			</section>
		</main>
	</div>
</template>

<style scoped>
.page {
	font-family:
		system-ui,
		-apple-system,
		sans-serif;
	max-width: 760px;
	margin: 0 auto;
	padding: 40px 24px 120px;
	color: #111;
}

.header {
	margin-bottom: 48px;
}

.header h1 {
	font-size: 22px;
	font-weight: 700;
	margin: 0 0 8px;
}

.header p {
	color: #666;
	margin: 0 0 20px;
	font-size: 14px;
}

.nav {
	display: flex;
	gap: 16px;
}

.nav a {
	font-size: 14px;
	color: #2563eb;
	text-decoration: none;
	font-weight: 500;
}

.nav a:hover {
	text-decoration: underline;
}

.section {
	margin-bottom: 40px;
	padding-bottom: 40px;
	border-bottom: 1px solid #f0f0f0;
}

.section h2 {
	font-size: 16px;
	font-weight: 600;
	margin: 0 0 8px;
}

.section p {
	color: #555;
	font-size: 14px;
	line-height: 1.6;
	margin: 0 0 16px;
}

.section a {
	font-size: 14px;
	color: #2563eb;
}

code {
	background: #f4f4f5;
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 12px;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.btn {
	padding: 8px 14px;
	font-size: 13px;
	font-weight: 500;
	border: 1px solid #d1d5db;
	border-radius: 6px;
	background: #fff;
	cursor: pointer;
	transition: background 0.1s;
}

.btn:hover {
	background: #f9fafb;
}

.btn.primary {
	background: #111;
	color: #fff;
	border-color: #111;
}

.btn.primary:hover {
	background: #333;
}

.btn.danger {
	color: #dc2626;
	border-color: #fca5a5;
}

.btn.danger:hover {
	background: #fef2f2;
}

.main {
	display: flex;
	flex-direction: column;
}

.flag-grid {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.flag-row {
	display: flex;
	align-items: center;
}

.flag-info {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	background: #fafafa;
	border: 1px solid #e5e7eb;
	border-radius: 6px;
	min-width: 260px;
}

.flag-key {
	font-family: ui-monospace, monospace;
	font-size: 12px;
	color: #374151;
	flex: 1;
}

.flag-status {
	font-size: 11px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 999px;
}

.flag-status.loading {
	background: #fef9c3;
	color: #854d0e;
}

.flag-status.on {
	background: #dcfce7;
	color: #15803d;
}

.flag-status.off {
	background: #f4f4f5;
	color: #71717a;
}
</style>
