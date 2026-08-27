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
		if (originUrl.hostname.includes("*")) {
			return false;
		}
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

const IPV6_GROUP_REGEX = /^[0-9a-f]{1,4}$/;
const IPV4_TAIL_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4TailToGroups(tail: string): string[] | null {
	const match = tail.match(IPV4_TAIL_REGEX);
	if (!match) {
		return null;
	}
	const octets = match.slice(1, 5).map((part) => Number.parseInt(part, 10));
	if (octets.some((octet) => octet > 255)) {
		return null;
	}
	const [a, b, c, d] = octets as [number, number, number, number];
	return [(a * 256 + b).toString(16), (c * 256 + d).toString(16)];
}

export function normalizeIpv6(ip: string): string | null {
	const value = ip.trim().toLowerCase();
	if (!value.includes(":") || value.includes("%")) {
		return null;
	}

	const halves = value.split("::");
	if (halves.length > 2) {
		return null;
	}

	const parseSide = (side: string): string[] | null => {
		if (side === "") {
			return [];
		}
		const groups: string[] = [];
		for (const group of side.split(":")) {
			if (IPV6_GROUP_REGEX.test(group)) {
				groups.push(group);
				continue;
			}
			const ipv4Groups = ipv4TailToGroups(group);
			if (!ipv4Groups) {
				return null;
			}
			groups.push(...ipv4Groups);
		}
		return groups;
	};

	const head = parseSide(halves[0] ?? "");
	const tail = halves.length === 2 ? parseSide(halves[1] ?? "") : [];
	if (!(head && tail)) {
		return null;
	}

	if (halves.length === 1) {
		if (head.length !== 8) {
			return null;
		}
		return head.map((group) => group.padStart(4, "0")).join(":");
	}

	const missing = 8 - head.length - tail.length;
	if (missing < 1) {
		return null;
	}

	const groups = [
		...head,
		...Array.from({ length: missing }, () => "0"),
		...tail,
	];
	return groups.map((group) => group.padStart(4, "0")).join(":");
}

export function isValidIpFromSettings(
	ip: string,
	allowedIps?: string[]
): boolean {
	if (!allowedIps || allowedIps.length === 0) {
		return true;
	}
	if (!ip?.trim()) {
		return false;
	}

	const trimmedIp = ip.trim();
	const normalizedIpv6 = trimmedIp.includes(":")
		? normalizeIpv6(trimmedIp)
		: null;

	for (const allowed of allowedIps) {
		if (allowed === trimmedIp) {
			return true;
		}
		if (
			normalizedIpv6 &&
			allowed.includes(":") &&
			!allowed.includes("/") &&
			normalizeIpv6(allowed) === normalizedIpv6
		) {
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
