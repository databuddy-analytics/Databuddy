export function chunkArray<T>(items: T[], size: number): T[][] {
	if (size <= 0) {
		throw new Error(`Invalid chunk size: ${size}. Must be greater than 0.`);
	}

	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}
