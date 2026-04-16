"use client";

import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

export interface FetchedOgData {
	description: string;
	image: string;
	title: string;
}

const TRUSTED_IMAGE_HOSTS = new Set(["cdn.databuddy.cc", "api.dicebear.com"]);

function isTrustedImageHost(url: string): boolean {
	try {
		const { hostname } = new URL(url);
		return TRUSTED_IMAGE_HOSTS.has(hostname);
	} catch {
		return false;
	}
}

export function getProxiedImageUrl(url: string): string {
	if (!url) {
		return "";
	}
	if (url.startsWith("/") || isTrustedImageHost(url)) {
		return url;
	}
	return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

async function fetchOgData(url: string): Promise<FetchedOgData> {
	if (!url) {
		throw new Error("No URL provided");
	}

	const fullUrl = url.startsWith("http") ? url : `https://${url}`;

	const response = await fetch(
		`https://api.microlink.io?url=${encodeURIComponent(fullUrl)}`
	);

	if (!response.ok) {
		throw new Error("Failed to fetch OG data");
	}

	const data = await response.json();

	return {
		title: data.data?.title ?? "",
		description: data.data?.description ?? "",
		image: data.data?.image?.url ?? data.data?.logo?.url ?? "",
	};
}

const OG_FETCH_DEBOUNCE_MS = 500;

export function useOgMetadata(targetUrl: string) {
	const [debouncedTargetUrl] = useDebouncedValue(targetUrl, {
		wait: OG_FETCH_DEBOUNCE_MS,
	});

	return useQuery({
		queryKey: ["og-preview", debouncedTargetUrl],
		queryFn: () => fetchOgData(debouncedTargetUrl),
		enabled: !!debouncedTargetUrl && debouncedTargetUrl.length > 3,
		staleTime: 5 * 60 * 1000,
		retry: 1,
	});
}

export type ImageStatus = "idle" | "loading" | "success" | "error";

export function useImageValidation(imageUrl: string) {
	const [status, setStatus] = useState<ImageStatus>("idle");
	const [retryKey, setRetryKey] = useState(0);

	useEffect(() => {
		if (!imageUrl) {
			setStatus("idle");
			return;
		}

		setStatus("loading");

		const img = new Image();
		img.onload = () => setStatus("success");
		img.onerror = () => setStatus("error");
		img.src = getProxiedImageUrl(imageUrl);

		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [imageUrl, retryKey]);

	const retry = useCallback(() => setRetryKey((k) => k + 1), []);

	return { status, retry };
}
