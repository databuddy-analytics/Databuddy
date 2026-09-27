import Image from "next/image";
import { cn } from "@databuddy/ui";

type BrandVariant = "logomark" | "wordmark";

interface BrandingProps {
	className?: string;
	heightPx?: number;
	imageClassName?: string;
	priority?: boolean;
	variant: BrandVariant;
}

const VIEWBOX_ASPECT: Record<BrandVariant, number> = {
	logomark: 997.25 / 1000,
	wordmark: 3529.1 / 722.77,
};

const BRAND_PATH: Record<BrandVariant, string> = {
	logomark: "/brand/logomark",
	wordmark: "/brand/wordmark",
};

interface ThemeBrandImageProps {
	alt: string;
	basePath: string;
	className?: string;
	height: number;
	priority?: boolean;
	width: number;
}

function ThemeBrandImage({
	basePath,
	alt,
	height,
	width,
	className,
	priority,
}: ThemeBrandImageProps) {
	return (
		<>
			<Image
				alt={alt}
				className={cn("dark:hidden", className)}
				height={height}
				priority={priority}
				src={`${basePath}/black.svg`}
				width={width}
			/>
			<Image
				alt=""
				aria-hidden
				className={cn("hidden dark:block", className)}
				height={height}
				priority={priority}
				src={`${basePath}/white.svg`}
				width={width}
			/>
		</>
	);
}

export function Branding({
	variant,
	className,
	imageClassName,
	heightPx = 32,
	priority = false,
}: BrandingProps) {
	const width = Math.round(heightPx * VIEWBOX_ASPECT[variant]);

	return (
		<div className={cn("inline-flex items-center", className)}>
			<ThemeBrandImage
				alt="Databuddy"
				basePath={BRAND_PATH[variant]}
				className={imageClassName}
				height={heightPx}
				priority={priority}
				width={width}
			/>
		</div>
	);
}
