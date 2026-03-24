import type { OgData } from "./og-preview";
import { appendUtmToUrl, type UtmParams } from "./utm-builder";

export function formatTarget(targetUrl: string): string {
	try {
		const parsed = new URL(targetUrl);
		return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
	} catch {
		return targetUrl;
	}
}

export function shortenId(id: string): string {
	if (id.length <= 8) {
		return id;
	}
	return `${id.slice(0, 3)}…${id.slice(-3)}`;
}

export function shortenUrl(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url.length <= 12 ? url : `${url.slice(0, 9)}…`;
	}
}

export function stripProtocol(url: string | null): string {
	if (!url) {
		return "";
	}
	if (url.startsWith("https://")) {
		return url.slice(8);
	}
	if (url.startsWith("http://")) {
		return url.slice(7);
	}
	return url;
}

export function ensureProtocol(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) {
		return trimmed;
	}
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

export function normalizeUrlInput(url: string): string {
	const trimmed = url.trim();
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			const parsed = new URL(trimmed);
			return parsed.host + parsed.pathname + parsed.search + parsed.hash;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

interface BuildPayloadInput {
	formData: {
		name: string;
		targetUrl: string;
		slug?: string;
		expiresAt?: string;
		expiredRedirectUrl?: string;
		iosUrl?: string;
		androidUrl?: string;
		externalId?: string;
	};
	utmParams: UtmParams;
	ogData: OgData;
	useCustomOg: boolean;
}

interface LinkPayload {
	name: string;
	targetUrl: string;
	slug: string | undefined;
	expiresAtDate: Date | undefined;
	expiresAtString: string | undefined;
	expiredRedirectUrl: string | undefined;
	ogTitle: string | undefined;
	ogDescription: string | undefined;
	ogImageUrl: string | undefined;
	ogVideoUrl: string | undefined;
	iosUrl: string | undefined;
	androidUrl: string | undefined;
	externalId: string | undefined;
}

export function buildLinkPayload({
	formData,
	utmParams,
	ogData,
	useCustomOg,
}: BuildPayloadInput): LinkPayload {
	const targetUrl = appendUtmToUrl(
		ensureProtocol(formData.targetUrl),
		utmParams,
	);

	const slug = formData.slug?.trim() || undefined;

	const expiresAtDate = formData.expiresAt
		? new Date(formData.expiresAt)
		: undefined;
	const expiresAtString = formData.expiresAt
		? new Date(formData.expiresAt).toISOString()
		: undefined;

	const expiredRedirectUrl = formData.expiredRedirectUrl?.trim()
		? ensureProtocol(formData.expiredRedirectUrl.trim())
		: undefined;

	const ogTitle = useCustomOg && ogData.ogTitle ? ogData.ogTitle : undefined;
	const ogDescription =
		useCustomOg && ogData.ogDescription ? ogData.ogDescription : undefined;
	const ogImageUrl =
		useCustomOg && ogData.ogImageUrl ? ogData.ogImageUrl : undefined;
	const ogVideoUrl =
		useCustomOg && ogData.ogVideoUrl ? ogData.ogVideoUrl : undefined;

	const iosUrl = formData.iosUrl?.trim()
		? ensureProtocol(formData.iosUrl.trim())
		: undefined;

	const androidUrl = formData.androidUrl?.trim()
		? ensureProtocol(formData.androidUrl.trim())
		: undefined;

	const externalId = formData.externalId?.trim() || undefined;

	return {
		name: formData.name,
		targetUrl,
		slug,
		expiresAtDate,
		expiresAtString,
		expiredRedirectUrl,
		ogTitle,
		ogDescription,
		ogImageUrl,
		ogVideoUrl,
		iosUrl,
		androidUrl,
		externalId,
	};
}

interface RpcError {
	data?: { code?: string };
	message?: string;
}

export function mapLinkApiError(error: unknown, isEditing: boolean): string {
	const defaultMessage = `Failed to ${isEditing ? "update" : "create"} link.`;
	const rpcError = error as RpcError;

	if (rpcError?.data?.code) {
		switch (rpcError.data.code) {
			case "CONFLICT":
				return "A link with this slug already exists.";
			case "FORBIDDEN":
				return (
					rpcError.message ||
					"You do not have permission to perform this action."
				);
			case "UNAUTHORIZED":
				return "You must be logged in to perform this action.";
			case "BAD_REQUEST":
				return rpcError.message || "Invalid request. Please check your input.";
			default:
				return rpcError.message || defaultMessage;
		}
	}

	return rpcError?.message || defaultMessage;
}
