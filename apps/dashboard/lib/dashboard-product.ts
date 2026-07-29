const INTELLIGENCE_HOST_PATTERN = /intelligence\.(?:databuddy\.cc|localhost)/;

export function isIntelligenceDashboard(): boolean {
	if (process.env.NEXT_PUBLIC_DASHBOARD_PRODUCT === "intelligence") {
		return true;
	}

	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
	if (!appUrl) {
		return false;
	}

	try {
		const { hostname, port } = new URL(
			appUrl.includes("://") ? appUrl : `https://${appUrl}`
		);
		if (INTELLIGENCE_HOST_PATTERN.test(hostname)) {
			return true;
		}
		return hostname === "localhost" && port === "3003";
	} catch {
		return false;
	}
}
