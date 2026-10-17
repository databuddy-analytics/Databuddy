"use client";

import { cn } from "../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { useState, type ImgHTMLAttributes } from "react";

const avatar = cva(
	"relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-secondary font-medium text-muted-foreground",
	{
		variants: {
			size: {
				sm: "size-6 text-xs",
				md: "size-8 text-sm",
				lg: "size-10 text-sm",
			},
		},
		defaultVariants: {
			size: "md",
		},
	}
);

type AvatarProps = VariantProps<typeof avatar> &
	Omit<ImgHTMLAttributes<HTMLImageElement>, "size"> & {
		fallback?: string;
	};

export function Avatar({
	className,
	size,
	src,
	alt,
	fallback,
	...rest
}: AvatarProps) {
	const [failedSrc, setFailedSrc] = useState<string | null>(null);

	const safeSrc = (() => {
		if (!src || typeof src !== "string") {
			return null;
		}
		if (src.startsWith("/")) {
			return src;
		}
		try {
			const parsed = new URL(src);
			return parsed.protocol === "http:" || parsed.protocol === "https:"
				? parsed.toString()
				: null;
		} catch {
			return null;
		}
	})();

	const initials =
		fallback ??
		(alt
			? alt
					.split(" ")
					.map((w) => w[0])
					.slice(0, 2)
					.join("")
					.toUpperCase()
			: "?");

	// Clearing during render lets a source that failed earlier retry when it is set again.
	if (failedSrc !== null && failedSrc !== safeSrc) {
		setFailedSrc(null);
	}

	if (!safeSrc || failedSrc === safeSrc) {
		return <span className={cn(avatar({ size }), className)}>{initials}</span>;
	}

	return (
		// biome-ignore lint/correctness/useImageSize: we are using a img element as a fallback for the avatar
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: we are using a img element as a fallback for the avatar
		<img
			alt={alt}
			className={cn(avatar({ size }), "object-cover", className)}
			onError={() => setFailedSrc(safeSrc)}
			src={safeSrc}
			{...rest}
		/>
	);
}
