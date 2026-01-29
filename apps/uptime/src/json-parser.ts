function extractAutoFields(
	json: Record<string, unknown>,
	path = ""
): ParsedJsonData {
	const result: ParsedJsonData = {};

	for (const [key, value] of Object.entries(json)) {
		const currentPath = path ? `${path}.${key}` : key;

		if (value && typeof value === "object" && !Array.isArray(value)) {
			const obj = value as Record<string, unknown>;

			if ("status" in obj || "latency" in obj) {
				result[currentPath] = {
					status: obj.status as string | number | boolean | undefined,
					latency: obj.latency as string | number | undefined,
					alarm_id: obj.alarm_id as string | undefined,
					notification_channels: obj.notification_channels as string[] | undefined,
					...obj,
				};
			} else {
				const nested = extractAutoFields(obj, currentPath);
				Object.assign(result, nested);
			}
		}
	}

	return result;
}