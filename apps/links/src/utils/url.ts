export function appendRef(url: string, linkId: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("ref", linkId);
	return parsed.toString();
}
