"use client";

import { GlobeIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";

type FaviconImageProps = {
	domain: string;
	altText?: string;
	size?: number;
	className?: string;
	fallbackIcon?: React.ReactNode;
};

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

	const invalid =
		!hostname ||
		hostname.length < 3 ||
		!hostname.includes(".") ||
		hostname === "direct" ||
		hostname === "unknown" ||
		hostname.includes("localhost") ||
		hostname.includes("127.0.0.1");

	const showFallback = invalid || error || !loaded;

	const isGitHub = hostname === "github.com";

	const fallbackContent = fallbackIcon || (
		<GlobeIcon
			aria-label={altText || "Website icon"}
			className="text-muted"
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
					src={`https://icons.duckduckgo.com/ip3/${hostname}.ico`}
					style={{ width: size, height: size }}
					width={size}
				/>
			)}
		</div>
	);
}
