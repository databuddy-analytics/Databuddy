interface ParseContext {
	contentType: string;
	request: Request;
}
export async function parseCorsSafeJson({
	contentType,
	request,
}: ParseContext): Promise<unknown | undefined> {
	if (contentType !== "text/plain") {
		return;
	}

	return JSON.parse(await request.text());
}
