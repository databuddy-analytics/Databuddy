import {
	getClientAppAllowedOrigins,
	normalizeOrigin,
} from "@databuddy/shared/utils/origins";

const DATABUDDY_DOMAIN_REGEX = /(?:^|\.)databuddy\.cc$/;

export function getAllowedCorsOrigins(): Array<string | RegExp> {
	const defaults = [
		process.env.BETTER_AUTH_URL,
		process.env.NEXT_PUBLIC_APP_URL,
		process.env.NEXT_PUBLIC_API_URL,
		process.env.DASHBOARD_URL,
		process.env.APP_URL,
		process.env.NODE_ENV === "development"
			? "http://localhost:3000"
			: undefined,
		process.env.NODE_ENV === "development"
			? "http://localhost:3100"
			: undefined,
		process.env.NODE_ENV === "development"
			? "http://localhost:3001"
			: undefined,
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => normalizeOrigin(value))
		.filter((value): value is string => Boolean(value));

	const extraOrigins = getClientAppAllowedOrigins();
	const authTrustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? "")
		.split(",")
		.map((origin) => normalizeOrigin(origin))
		.filter((origin): origin is string => Boolean(origin));

	return [
		DATABUDDY_DOMAIN_REGEX,
		...new Set([...defaults, ...authTrustedOrigins, ...extraOrigins]),
	];
}

export function getPublicCorsOrigins(): true | Array<string | RegExp> {
	return process.env.PUBLIC_API_CORS_MODE === "restricted"
		? getAllowedCorsOrigins()
		: true;
}
