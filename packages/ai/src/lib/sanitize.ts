const TAG_START = /^<\/?[a-z_]/i;

function stripTagsOnce(value: string): string {
	const lastClose = value.lastIndexOf(">");
	let out = "";
	for (let i = 0; i < value.length; i++) {
		if (
			value[i] === "<" &&
			i < lastClose &&
			TAG_START.test(value.slice(i, i + 3))
		) {
			i = value.indexOf(">", i);
			continue;
		}
		out += value[i];
	}
	return out;
}

export function stripHtmlTags(value: string, maxLength?: number): string {
	let cleaned = maxLength ? value.slice(0, maxLength) : value;
	let prev: string;
	do {
		prev = cleaned;
		cleaned = stripTagsOnce(cleaned);
	} while (cleaned !== prev);
	return cleaned;
}
