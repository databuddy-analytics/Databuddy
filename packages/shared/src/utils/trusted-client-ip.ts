import { isIP } from "node:net";

const DEFAULT_TRUSTED_IP_HEADER = "cf-connecting-ip";
export function getTrustedClientIp(
	headers: Pick<Headers, "get">
): string | undefined {
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
	if (!candidate || isIP(candidate) === 0) {
		return;
	}

	return candidate;
}
