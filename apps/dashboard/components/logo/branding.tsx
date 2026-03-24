import Image from "next/image";
import { cn } from "@/lib/utils";

export type BrandVariant =
	| "logomark"
	| "wordmark"
	| "primary-logo"
	| "secondary-logo";

export interface BrandingProps {
	variant: BrandVariant;
	/** When `variant` is `logomark`, also show the wordmark asset beside the icon. */
	wordmark?: boolean;
	className?: string;
	imageClassName?: string;
	/** Height of the primary asset in pixels (width follows the SVG viewBox aspect ratio). */
	heightPx?: number;
	priority?: boolean;
}

const VIEWBOX_ASPECT: Record<BrandVariant, number> = {
	logomark: 997.25 / 1000,
	wordmark: 3529.1 / 722.77,
	"primary-logo": 4633.76 / 1091.09,
	"secondary-logo": 3529.1 / 2314.68,
};

const BRAND_PATH: Record<BrandVariant, string> = {
	logomark: "/brand/logomark",
	wordmark: "/brand/wordmark",
	"primary-logo": "/brand/primary-logo",
	"secondary-logo": "/brand/secondary-logo",
};

interface ThemeBrandImageProps {
	basePath: string;
	/** Primary image alt; the dark-mode twin is decorative. */
	alt: string;
	height: number;
	width: number;
	className?: string;
	priority?: boolean;
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
	wordmark = false,
	className,
	imageClassName,
	heightPx = 32,
	priority = false,
}: BrandingProps) {
	const aspect = VIEWBOX_ASPECT[variant];
	const width = Math.round(heightPx * aspect);
	const base = BRAND_PATH[variant];

	const showWordmarkPair = wordmark && variant === "logomark";

	if (showWordmarkPair) {
		const logomarkWidth = Math.round(heightPx * VIEWBOX_ASPECT.logomark);
		const wordmarkHeight = Math.round(heightPx * 0.68);
		const wordmarkWidth = Math.round(wordmarkHeight * VIEWBOX_ASPECT.wordmark);

		return (
			<div
				className={cn(
					"flex items-center gap-2 [&_img]:h-auto [&_img]:max-h-full [&_img]:w-auto",
					className
				)}
			>
				<ThemeBrandImage
					alt="Databuddy"
					basePath={BRAND_PATH.logomark}
					className={imageClassName}
					height={heightPx}
					priority={priority}
					width={logomarkWidth}
				/>
				<ThemeBrandImage
					alt=""
					basePath={BRAND_PATH.wordmark}
					className={imageClassName}
					height={wordmarkHeight}
					priority={priority}
					width={wordmarkWidth}
				/>
			</div>
		);
	}

	return (
		<div className={cn("inline-flex items-center", className)}>
			<ThemeBrandImage
				alt="Databuddy"
				basePath={base}
				className={imageClassName}
				height={heightPx}
				priority={priority}
				width={width}
			/>
		</div>
	);
}
