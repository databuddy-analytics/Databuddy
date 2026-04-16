const REGEX_WWW_PREFIX = /^www\./;

function normalizeDomain(domain: string): string {
	if (!domain) {
		return "";
	}
	let urlString = domain.toLowerCase().trim();
	if (!urlString.includes("://")) {
		urlString = `https://${urlString}`;
	}
	try {
		return new URL(urlString).hostname.replace(REGEX_WWW_PREFIX, "");
	} catch {
		return "";
	}
}

function isSubdomain(origin: string, base: string): boolean {
	return origin.endsWith(`.${base}`) && origin.length > base.length + 1;
}

export function isValidOriginFromSettings(
	originHeader: string,
	allowedOrigins?: string[]
): boolean {
	if (!originHeader?.trim()) {
		return true;
	}
	if (!allowedOrigins || allowedOrigins.length === 0) {
		return true;
	}

	try {
		const originUrl = new URL(originHeader.trim());
		const originDomain = normalizeDomain(originUrl.hostname);

		for (const allowed of allowedOrigins) {
			if (allowed === "*") {
				return true;
			}

			if (allowed === "localhost") {
				if (originDomain === "localhost") {
					return true;
				}
				continue;
			}

			if (allowed.includes("localhost:*")) {
				if (originDomain === "localhost") {
					return true;
				}
				continue;
			}

			if (allowed.startsWith("*.")) {
				const baseDomain = normalizeDomain(allowed.slice(2));
				if (
					originDomain === baseDomain ||
					isSubdomain(originDomain, baseDomain)
				) {
					return true;
				}
				continue;
			}

			if (originDomain === normalizeDomain(allowed)) {
				return true;
			}
		}

		return false;
	} catch {
		return false;
	}
}

export function isValidIpFromSettings(
	ip: string,
	allowedIps?: string[]
): boolean {
	if (!ip?.trim()) {
		return true;
	}
	if (!allowedIps || allowedIps.length === 0) {
		return true;
	}

	const trimmedIp = ip.trim();

	for (const allowed of allowedIps) {
		if (allowed === trimmedIp) {
			return true;
		}
		if (allowed.includes("/") && isIpInCidrRange(trimmedIp, allowed)) {
			return true;
		}
	}

	return false;
}

function isIpInCidrRange(ip: string, cidr: string): boolean {
	try {
		const [network, prefixLengthStr] = cidr.split("/");
		const prefixLength = Number.parseInt(prefixLengthStr, 10);

		if (Number.isNaN(prefixLength) || prefixLength < 0 || prefixLength > 32) {
			return false;
		}

		const ipToNumber = (ipAddr: string): number => {
			const parts = ipAddr.split(".");
			return (
				Number.parseInt(parts[0] ?? "0", 10) * 16_777_216 +
				Number.parseInt(parts[1] ?? "0", 10) * 65_536 +
				Number.parseInt(parts[2] ?? "0", 10) * 256 +
				Number.parseInt(parts[3] ?? "0", 10)
			);
		};

		const networkNum = ipToNumber(network);
		const ipNum = ipToNumber(ip);
		const maskSize = 2 ** (32 - prefixLength);

		return (
			Math.floor(networkNum / maskSize) * maskSize ===
			Math.floor(ipNum / maskSize) * maskSize
		);
	} catch {
		return false;
	}
}
