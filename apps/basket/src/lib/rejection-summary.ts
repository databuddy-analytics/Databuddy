const REJECTED_SUMMARY_MAX_NAMES = 50;
const REJECTED_SUMMARY_MAX_PROPERTY_KEYS = 50;
const EVENT_NAME_MAX = 256;
const PROPERTY_KEY_MAX = 128;

function readEventName(record: Record<string, unknown>): string | undefined {
	const name = typeof record.name === "string" ? record.name : record.eventName;
	if (
		typeof name === "string" &&
		name.length > 0 &&
		name.length <= EVENT_NAME_MAX
	) {
		return name;
	}
	return;
}

export function summarizeRejectedBody(body: unknown):
	| {
			rejectedEventCount: number;
			rejectedEventNames: string[];
			rejectedPropertyKeys: string[];
			rejectedHasWebsiteId: boolean;
	  }
	| undefined {
	try {
		const events = Array.isArray(body) ? body : [body];
		const names: string[] = [];
		const propertyKeys = new Set<string>();
		let hasWebsiteId = false;
		for (const event of events) {
			if (!event || typeof event !== "object") {
				continue;
			}
			const record = event as Record<string, unknown>;
			const name = readEventName(record);
			if (name) {
				names.push(name);
			}
			if (typeof record.websiteId === "string" && record.websiteId.length > 0) {
				hasWebsiteId = true;
			}
			const properties = record.properties;
			if (properties && typeof properties === "object") {
				for (const key of Object.keys(properties)) {
					if (key.length <= PROPERTY_KEY_MAX) {
						propertyKeys.add(key);
					}
					if (propertyKeys.size >= REJECTED_SUMMARY_MAX_PROPERTY_KEYS) {
						break;
					}
				}
			}
		}
		return {
			rejectedEventCount: events.length,
			rejectedEventNames: names.slice(0, REJECTED_SUMMARY_MAX_NAMES),
			rejectedPropertyKeys: Array.from(propertyKeys).slice(
				0,
				REJECTED_SUMMARY_MAX_PROPERTY_KEYS
			),
			rejectedHasWebsiteId: hasWebsiteId,
		};
	} catch {
		return;
	}
}
