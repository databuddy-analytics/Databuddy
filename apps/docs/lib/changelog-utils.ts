export function formatChangelogDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function externalizeLinks(html: string): string {
	return html.replace(/<a\s+([^>]*)>/g, (_, attrs) => {
		if (!attrs.includes("href=")) {
			return `<a ${attrs}>`;
		}
		if (attrs.includes("target=")) {
			return `<a ${attrs}>`;
		}
		return `<a target="_blank" rel="noopener noreferrer" ${attrs}>`;
	});
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
