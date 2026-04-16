"use client";

import { GlobeIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { resolveFaviconCanonicalHost } from "@/lib/favicon-domain";
import { cn } from "@/lib/utils";

interface FaviconImageProps {
	altText?: string;
	className?: string;
	domain: string;
	fallbackIcon?: React.ReactNode;
	size?: number;
}

// Google S2 only serves these exact sizes — any other value falls back to 16x16.
const S2_BUCKETS = [16, 24, 32, 48, 64, 96, 128, 256];
const s2Size = (target: number) => S2_BUCKETS.find((b) => b >= target) ?? 256;

const PROTOCOL_RE = /^https?:\/\//;
const WWW_RE = /^www\./;
const PATH_RE = /[/?#]/;

function extractHostname(domain: string): string {
	return (
		domain.replace(PROTOCOL_RE, "").replace(WWW_RE, "").split(PATH_RE)[0] ?? ""
	);
}

function isValidHost(host: string): boolean {
	return (
		host.length >= 3 &&
		host.includes(".") &&
		host !== "direct" &&
		host !== "unknown" &&
		!host.includes("localhost") &&
		!host.includes("127.0.0.1")
	);
}

export function FaviconImage({
	domain,
	altText,
	size = 20,
	className,
	fallbackIcon,
}: FaviconImageProps) {
	const [error, setError] = useState(false);
	const [loaded, setLoaded] = useState(false);

	const hostname = extractHostname(domain);
	const faviconHost = resolveFaviconCanonicalHost(hostname);
	const valid = isValidHost(hostname);
	const showFallback = !valid || error || !loaded;

	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center justify-center rounded-sm",
				className
			)}
			style={{ width: size, height: size }}
		>
			{showFallback &&
				(fallbackIcon ?? (
					<GlobeIcon
						aria-label={altText || "Website icon"}
						className="absolute inset-0 m-auto text-muted-foreground"
						size={size}
						weight="duotone"
					/>
				))}
			{valid && (
				<Image
					alt={altText || `${domain} favicon`}
					className={cn(
						"transition-opacity",
						faviconHost === "github.com" && "dark:invert",
						loaded ? "opacity-100" : "opacity-0"
					)}
					height={size}
					onError={() => setError(true)}
					onLoad={() => setLoaded(true)}
					src={`https://www.google.com/s2/favicons?domain=${faviconHost}&sz=${s2Size(size * 2)}`}
					style={{ width: size, height: size }}
					width={size}
				/>
			)}
		</div>
	);
}
