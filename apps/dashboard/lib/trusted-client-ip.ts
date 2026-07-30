import { isIP } from "node:net";

const DEFAULT_TRUSTED_IP_HEADER = "cf-connecting-ip";

/**
 * Returns a client IP only when deployment traffic is forced through a proxy
 * that overwrites the configured header. Without that explicit boundary, all
 * forwarding headers are client-controlled and must not enter audit records.
 */
export function getTrustedClientIp(headers: Headers): string | undefined {
	if (process.env.IP_HEADER_VERIFIED?.toLowerCase() !== "true") {
		return;
	}

	const headerName = (
		process.env.TRUSTED_IP_HEADER ?? DEFAULT_TRUSTED_IP_HEADER
	)
		.trim()
		.toLowerCase();
	const value = headers.get(headerName);
	if (!value) {
		return;
	}

	const candidate =
		headerName === "x-forwarded-for"
			? value.split(",")[0]?.trim()
			: value.trim();

	return candidate && isIP(candidate) ? candidate : undefined;
}
