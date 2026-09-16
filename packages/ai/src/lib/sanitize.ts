const TAG_NAME_START = /[a-z_]/i;

function isTagStart(value: string, index: number): boolean {
	const name = value[index + 1] === "/" ? value[index + 2] : value[index + 1];
	return name !== undefined && TAG_NAME_START.test(name);
}

function stripTagsOnce(value: string): string {
	const lastClose = value.lastIndexOf(">");
	let out = "";
	for (let i = 0; i < value.length; i++) {
		if (value[i] === "<" && i < lastClose && isTagStart(value, i)) {
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
