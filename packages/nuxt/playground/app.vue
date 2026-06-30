<!--
  Root app shell. NuxtPage renders the active route; DebugPanel is a
  fixed overlay that shows all intercepted analytics events in real time.
  Both are auto-imported — no explicit import statements needed.
-->
<template>
	<div>
		<NuxtPage />
		<DebugPanel />
	</div>
</template>
