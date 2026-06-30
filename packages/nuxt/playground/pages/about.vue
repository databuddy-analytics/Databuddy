<script setup lang="ts">
const { track } = useDatabuddy();
</script>

<template>
	<div class="page">
		<nav class="nav">
			<NuxtLink to="/">← Home</NuxtLink>
			<NuxtLink to="/contact">Contact</NuxtLink>
		</nav>
		<h1>About</h1>
		<p>
			Navigating here triggered a <code>screen_view</code> event automatically —
			check the debug panel.
		</p>
		<button
			type="button"
			class="btn"
			@click="track('about_cta_clicked', { page: 'about' })"
		>
			Track event from about page
		</button>
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

.page h1 {
	font-size: 22px;
	font-weight: 700;
	margin: 0 0 12px;
}

.page p {
	color: #555;
	font-size: 14px;
	line-height: 1.6;
	margin: 0 0 20px;
}

.nav {
	display: flex;
	gap: 16px;
	margin-bottom: 32px;
}

.nav a {
	font-size: 14px;
	color: #2563eb;
	text-decoration: none;
	font-weight: 500;
}

code {
	background: #f4f4f5;
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 12px;
}

.btn {
	padding: 8px 14px;
	font-size: 13px;
	font-weight: 500;
	border: 1px solid #d1d5db;
	border-radius: 6px;
	background: #fff;
	cursor: pointer;
}

.btn:hover {
	background: #f9fafb;
}
</style>
