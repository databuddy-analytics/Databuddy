export function formatChangelogDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function externalizeLinks(html: string): string {
	return html.replace(
		/<a\s+(href="[^"]*")/g,
		'<a target="_blank" rel="noopener noreferrer" $1'
	);
}

export function splitChangelogContent(html: string): {
	description: string;
	body: string;
} {
	const h2Index = html.indexOf("<h2>");
	if (h2Index === -1) {
		return { description: html, body: "" };
	}
	return {
		description: html.slice(0, h2Index).trim(),
		body: html.slice(h2Index).trim(),
	};
}
