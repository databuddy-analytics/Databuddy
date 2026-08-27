const FIRST_CHARACTER_PATTERN = /^./;

export function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return `${value.slice(0, maxLength - 1)}…`;
}

export function isUserFacingMetadata(key: string): boolean {
	return !(
		key === "to" ||
		key === "template" ||
		key === "zScore" ||
		key.endsWith("Id")
	);
}

export function formatMetadataLabel(key: string): string {
	return key
		.replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replaceAll(/[_-]+/g, " ")
		.replace(FIRST_CHARACTER_PATTERN, (character) => character.toUpperCase());
}
