"use client";

import { GlobeIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { resolveFaviconCanonicalHost } from "@/lib/favicon-domain";

interface FaviconImageProps {
	altText?: string;
	className?: string;
	domain: string;
	fallbackIcon?: React.ReactNode;
	size?: number;
}

const hostnameRegex = /^https?:\/\//;
const wwwRegex = /^www\./;

export function FaviconImage({
	domain,
	altText,
	size = 20,
	className = "",
	fallbackIcon,
}: FaviconImageProps) {
	const [error, setError] = useState(false);
	const [loaded, setLoaded] = useState(false);

	const hostname = domain
		.replace(hostnameRegex, "")
		.replace(wwwRegex, "")
		.split("/")[0]
		.split("?")[0]
		.split("#")[0];

	const faviconHost = resolveFaviconCanonicalHost(hostname);

	const invalid =
		!hostname ||
		hostname.length < 3 ||
		!hostname.includes(".") ||
		hostname === "direct" ||
		hostname === "unknown" ||
		hostname.includes("localhost") ||
		hostname.includes("127.0.0.1");

	const showFallback = invalid || error || !loaded;

	const isGitHub = faviconHost === "github.com";

	const fallbackContent = fallbackIcon || (
		<GlobeIcon
			aria-label={altText || "Website icon"}
			className="text-muted-foreground"
			size={size}
			weight="duotone"
		/>
	);

	return (
		<div
			className={`${className} relative flex shrink-0 items-center justify-center rounded-sm`}
			style={{ width: size, height: size, minWidth: size, minHeight: size }}
		>
			{showFallback && (
				<div
					className={`absolute inset-0 flex items-center justify-center ${loaded ? "opacity-0" : "opacity-100"} transition-opacity`}
				>
					{fallbackContent}
				</div>
			)}
			{!invalid && (
				<Image
					alt={altText || `${domain} favicon`}
					className={`${isGitHub ? "dark:invert" : ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity`}
					height={size}
					onError={() => setError(true)}
					onLoad={() => setLoaded(true)}
					src={`https://icons.duckduckgo.com/ip3/${faviconHost}.ico`}
					style={{ width: size, height: size }}
					width={size}
				/>
			)}
		</div>
	);
}
