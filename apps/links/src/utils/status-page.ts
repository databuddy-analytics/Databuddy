interface StatusPageConfig {
	title: string;
	heading: string;
	description: string;
	icon: "clock" | "link-break" | "warning";
}

const ICONS = {
	clock: `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
		<path d="M128,40a96,96,0,1,0,96,96A96.11,96.11,0,0,0,128,40Zm0,176a80,80,0,1,1,80-80A80.09,80.09,0,0,1,128,216ZM173.66,90.34a8,8,0,0,1,0,11.32l-40,40a8,8,0,0,1-11.32-11.32l40-40A8,8,0,0,1,173.66,90.34ZM96,16a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,16Z"/>
	</svg>`,
	"link-break": `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
		<path d="M232,80a56,56,0,0,1-56,56H152a8,8,0,0,1,0-16h24a40,40,0,0,0,0-80H152a8,8,0,0,1,0-16h24A56.06,56.06,0,0,1,232,80ZM80,24H56A56.06,56.06,0,0,0,0,80a56,56,0,0,0,56,56H80a8,8,0,0,0,0-16H56a40,40,0,0,1,0-80H80a8,8,0,0,0,0-16ZM216,152H192a8,8,0,0,0,0,16h24a40,40,0,0,1,0,80H192a8,8,0,0,0,0,16h24a56,56,0,0,0,0-112ZM64,152H40a56,56,0,0,0,0,112H64a8,8,0,0,0,0-16H40a40,40,0,0,1,0-80H64a8,8,0,0,0,0-16Zm56-48a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,120,104Zm32,88a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V200A8,8,0,0,0,152,192Z"/>
	</svg>`,
	warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 256 256">
		<path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/>
	</svg>`,
};

export function generateStatusPageHtml(config: StatusPageConfig): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${config.title}</title>
	<meta name="robots" content="noindex">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			background: oklch(0.18 0.006 286.033);
			color: oklch(0.88 0.008 286.033);
			min-height: 100dvh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 1.5rem;
			-webkit-font-smoothing: antialiased;
			-moz-osx-font-smoothing: grayscale;
		}
		.container {
			text-align: center;
			max-width: 400px;
		}
		.icon-wrapper {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 4rem;
			height: 4rem;
			border-radius: 0.35rem;
			background: oklch(0.28 0.006 286.033);
			border: 1px solid oklch(0.28 0.006 286.033);
			margin-bottom: 1.5rem;
		}
		.icon-wrapper svg {
			width: 2rem;
			height: 2rem;
			color: oklch(0.55 0.006 286.033);
		}
		h1 {
			font-size: 1.25rem;
			font-weight: 600;
			margin-bottom: 0.5rem;
			letter-spacing: -0.01em;
		}
		p {
			color: oklch(0.55 0.006 286.033);
			font-size: 0.875rem;
			line-height: 1.6;
			text-wrap: pretty;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="icon-wrapper">
			${ICONS[config.icon]}
		</div>
		<h1>${config.heading}</h1>
		<p>${config.description}</p>
	</div>
</body>
</html>`;
}

export const EXPIRED_PAGE_HTML = generateStatusPageHtml({
	title: "Link Expired",
	heading: "This link has expired",
	description:
		"The link you're trying to access is no longer available. It may have been set to expire after a certain date.",
	icon: "clock",
});

export const NOT_FOUND_PAGE_HTML = generateStatusPageHtml({
	title: "Link Not Found",
	heading: "This link doesn't exist",
	description:
		"The link you're trying to access could not be found. It may have been deleted or never existed.",
	icon: "link-break",
});
