<template>
	<div class="page">
		<nav class="nav">
			<NuxtLink to="/">← Home</NuxtLink>
			<NuxtLink to="/about">About</NuxtLink>
		</nav>
		<h1>Contact</h1>
		<p>Another page to test SPA navigation — check the debug panel for the <code>screen_view</code> event.</p>
	</div>
</template>

<style scoped>
.page {
	font-family: system-ui, -apple-system, sans-serif;
	max-width: 760px;
	margin: 0 auto;
	padding: 40px 24px 120px;
	color: #111;
}
.page h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; }
.page p { color: #555; font-size: 14px; line-height: 1.6; }
.nav { display: flex; gap: 16px; margin-bottom: 32px; }
.nav a { font-size: 14px; color: #2563eb; text-decoration: none; font-weight: 500; }
code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
