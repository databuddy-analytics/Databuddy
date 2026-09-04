export function getClientIp(headers: Pick<Headers, "get">): string | undefined {
	return (
		headers.get("cf-connecting-ip") ||
		headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		headers.get("x-real-ip") ||
		undefined
	);
}
