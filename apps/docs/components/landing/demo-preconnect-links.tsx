import { getDemoEmbedOrigin } from "@/lib/demo-embed-url";

export function DemoPreconnectLinks() {
	return (
		<link
			crossOrigin="anonymous"
			href={getDemoEmbedOrigin(null)}
			rel="preconnect"
		/>
	);
}
