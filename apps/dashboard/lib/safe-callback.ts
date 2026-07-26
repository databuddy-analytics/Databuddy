const CALLBACK_ORIGIN = "https://callback.databuddy.invalid";

export function safeCallbackPath(
	callback: string | null | undefined,
	fallback = "/websites"
): string {
	if (typeof callback !== "string" || !isSafePath(callback)) {
		return fallback;
	}

	return callback;
}

function isSafePath(value: string): boolean {
	if (hasUnsafePathSyntax(value)) {
		return false;
	}

	let decoded = value;
	for (let pass = 0; pass < 5; pass += 1) {
		let next: string;
		try {
			next = decodeURIComponent(decoded);
		} catch {
			return false;
		}

		if (hasUnsafePathSyntax(next)) {
			return false;
		}
		if (next === decoded) {
			break;
		}
		if (pass === 4) {
			return false;
		}
		decoded = next;
	}

	try {
		return new URL(value, CALLBACK_ORIGIN).origin === CALLBACK_ORIGIN;
	} catch {
		return false;
	}
}

function hasUnsafePathSyntax(value: string): boolean {
	return (
		!value.startsWith("/") ||
		value.startsWith("//") ||
		value.includes("\\") ||
		hasControlCharacter(value)
	);
}

function hasControlCharacter(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || (code >= 127 && code <= 159);
	});
}
