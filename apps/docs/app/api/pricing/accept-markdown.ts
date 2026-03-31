/** True when `text/markdown` beats `text/html` on the Accept header. */
export function acceptMarkdownOverHtml(accept: string): boolean {
	const q = new Map<string, number>();
	for (const part of accept.split(",")) {
		const s = part.trim();
		if (!s) {
			continue;
		}
		const [name, ...params] = s.split(";").map((x) => x.trim());
		const t = name?.toLowerCase();
		if (!t) {
			continue;
		}
		let weight = 1;
		for (const p of params) {
			if (p.toLowerCase().startsWith("q=")) {
				const n = Number.parseFloat(p.slice(2));
				if (!Number.isNaN(n)) {
					weight = n;
				}
			}
		}
		q.set(t, Math.max(q.get(t) ?? 0, weight));
	}
	const md = q.get("text/markdown");
	if (md === undefined || md === 0) {
		return false;
	}
	return md > (q.get("text/html") ?? 0);
}
