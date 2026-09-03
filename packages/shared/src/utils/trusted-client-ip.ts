import { isIP } from "node:net";

const CLOUDFLARE_CLIENT_IP = "cf-connecting-ip";

export function getTrustedClientIp(
	headers: Pick<Headers, "get">
): string | undefined {
	const value = headers.get(CLOUDFLARE_CLIENT_IP)?.trim();
	if (!value || isIP(value) === 0) {
		return;
	}
	return value;
}
