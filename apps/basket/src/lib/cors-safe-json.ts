interface ParseContext {
	contentType: string;
	request: Request;
}

/**
 * Unload beacons use text/plain so cross-origin delivery remains a CORS simple
 * request. Parse that JSON before the normal ingest schemas validate it.
 */
export async function parseCorsSafeJson({
	contentType,
	request,
}: ParseContext): Promise<unknown | undefined> {
	if (contentType !== "text/plain") {
		return;
	}

	return JSON.parse(await request.text());
}
