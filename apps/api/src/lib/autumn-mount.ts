/** Elysia `.mount("/api/autumn", …)` strips the prefix, so the inner pathname is `/attach` not `/api/autumn/attach`. Autumn's router matches full paths under `/api/autumn`. */
const AUTUMN_API_PREFIX = "/api/autumn";

export function withAutumnApiPath(request: Request): Request {
	const url = new URL(request.url);
	const path = `${AUTUMN_API_PREFIX}${url.pathname === "/" ? "" : url.pathname}`;
	return new Request(
		new URL(path + url.search, url.origin).toString(),
		request
	);
}

export { AUTUMN_API_PREFIX };
