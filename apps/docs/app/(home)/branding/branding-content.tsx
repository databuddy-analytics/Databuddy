"use client";

import {
	BrandingAssetCard,
	type BrandingAssetItem,
} from "@/components/branding/branding-asset-card";
import { BrandingColorSwatch } from "@/components/branding/branding-color-swatch";
import { cn } from "@/lib/utils";

const LOGO_ASSETS: { category: string; items: BrandingAssetItem[] }[] = [
	{
		category: "Logomark",
		items: [
			{
				label: "Logomark",
				path: "/brand/logomark/black.svg",
				variant: "light",
				filename: "logomark-light",
			},
			{
				label: "Logomark",
				path: "/brand/logomark/white.svg",
				variant: "dark",
				filename: "logomark-dark",
			},
		],
	},
	{
		category: "Primary Logo",
		items: [
			{
				label: "Primary Logo",
				path: "/brand/primary-logo/black.svg",
				variant: "light",
				filename: "primary-logo-light",
			},
			{
				label: "Primary Logo",
				path: "/brand/primary-logo/white.svg",
				variant: "dark",
				filename: "primary-logo-dark",
			},
		],
	},
	{
		category: "Secondary Logo",
		items: [
			{
				label: "Secondary Logo",
				path: "/brand/secondary-logo/black.svg",
				variant: "light",
				filename: "secondary-logo-light",
			},
			{
				label: "Secondary Logo",
				path: "/brand/secondary-logo/white.svg",
				variant: "dark",
				filename: "secondary-logo-dark",
			},
		],
	},
	{
		category: "Wordmark",
		items: [
			{
				label: "Wordmark",
				path: "/brand/wordmark/black.svg",
				variant: "light",
				filename: "wordmark-light",
			},
			{
				label: "Wordmark",
				path: "/brand/wordmark/white.svg",
				variant: "dark",
				filename: "wordmark-dark",
			},
		],
	},
];

const BUNNY_ASSETS: BrandingAssetItem[] = [
	{
		label: "8-bit Bunny",
		path: "/brand/bunny/black.svg",
		variant: "light",
		filename: "bunny-black",
	},
	{
		label: "8-bit Bunny",
		path: "/brand/bunny/white.svg",
		variant: "dark",
		filename: "bunny-white",
	},
	{
		label: "8-bit Bunny",
		path: "/brand/bunny/off-black.svg",
		variant: "light",
		filename: "bunny-off-black",
	},
	{
		label: "8-bit Bunny",
		path: "/brand/bunny/off-white.svg",
		variant: "dark",
		filename: "bunny-off-white",
	},
];

const BRAND_COLORS = [
	{
		hex: "#27282D",
		name: "Deep Black",
		usage: "Primary text on light",
		textColor: "light" as const,
	},
	{
		hex: "#E7E8EB",
		name: "Off White",
		usage: "Primary text on dark",
		textColor: "dark" as const,
	},
	{
		hex: "#E3A514",
		name: "Amber",
		usage: "CTAs & emphasis",
		textColor: "dark" as const,
	},
	{
		hex: "#B74677",
		name: "Coral",
		usage: "CTAs & emphasis",
		textColor: "light" as const,
	},
	{
		hex: "#453C7C",
		name: "Deep Purple",
		usage: "CTAs & emphasis",
		textColor: "light" as const,
	},
];

const CLEARSPACE_RULES = [
	{
		asset: "Logomark",
		clearspace: "0.5x",
		minSize: "32px",
		note: "x = height of the logomark",
	},
	{
		asset: "Primary Logo",
		clearspace: "0.5x",
		minSize: "50px",
		note: "x = height of the bunny",
	},
	{
		asset: "Secondary Logo",
		clearspace: "0.5x",
		minSize: "100px",
		note: "x = height of the bunny",
	},
	{
		asset: "Wordmark",
		clearspace: "1x",
		minSize: "30px",
		note: "x = height of the wordmark",
	},
];

function SectionHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="mb-8 max-w-2xl sm:mb-10">
			<div className="mb-3 h-0.5 w-8 rounded bg-brand-coral" />
			<h2 className="mb-2 text-balance font-semibold text-2xl text-foreground sm:text-3xl">
				{title}
			</h2>
			<p className="text-pretty text-muted-foreground text-sm sm:text-base">
				{description}
			</p>
		</div>
	);
}

export default function BrandingContent() {
	return (
		<div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
			{/* Hero */}
			<div className="mb-16 max-w-3xl sm:mb-24">
				<p className="mb-3 font-medium text-brand-amber text-sm uppercase tracking-wide">
					Brand guidelines
				</p>
				<h1 className="mb-4 text-balance font-semibold text-3xl text-foreground sm:text-4xl lg:text-5xl">
					Databuddy brand assets
				</h1>
				<p className="text-pretty text-base text-muted-foreground sm:text-lg">
					Everything you need to represent Databuddy. Use these assets
					consistently to maintain our brand identity across all touchpoints.
					Hover any asset for copy and download actions.
				</p>
			</div>

			{/* Logos */}
			<section className="mb-16 sm:mb-24" id="logos">
				<SectionHeader
					description="Our logo system includes the logomark, primary logo, secondary (stacked) logo, and wordmark. Each is available in light and dark variants as SVG."
					title="Logo system"
				/>

				<div className="space-y-10 sm:space-y-12">
					{LOGO_ASSETS.map((group) => (
						<div key={group.category}>
							<h3 className="mb-4 font-medium text-brand-purple text-sm dark:text-brand-coral">
								{group.category}
							</h3>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{group.items.map((item) => (
									<BrandingAssetCard item={item} key={`${item.filename}`} />
								))}
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Color Palette */}
			<section className="mb-16 sm:mb-24" id="colors">
				<SectionHeader
					description="Our core palette is designed for AAA contrast compliance. Click any swatch to copy its hex value."
					title="Color palette"
				/>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					{BRAND_COLORS.map((color) => (
						<BrandingColorSwatch
							hex={color.hex}
							key={color.hex}
							name={color.name}
							textColor={color.textColor}
							usage={color.usage}
						/>
					))}
				</div>

				<div className="mt-8 space-y-4 rounded border border-brand-purple/20 bg-brand-purple/3 p-5">
					<h3 className="font-medium text-brand-purple text-sm dark:text-brand-coral">
						Color usage
					</h3>
					<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
						<div>
							<p className="mb-1 font-medium text-foreground text-xs">
								Primary text
							</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Deep Black on light backgrounds, Off White on dark backgrounds.
								Must meet AAA contrast for body copy.
							</p>
						</div>
						<div>
							<p className="mb-1 font-medium text-foreground text-xs">
								Headlines
							</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Same pairing — larger size and weight provide sufficient
								contrast on their own.
							</p>
						</div>
						<div>
							<p className="mb-1 font-medium text-foreground text-xs">
								CTAs & emphasis
							</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Darker shades on light backgrounds, base colors on dark. Strong
								visibility while retaining palette character.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Gradients */}
			<section className="mb-16 sm:mb-24" id="gradients">
				<SectionHeader
					description="Gradients are a core expression of the brand identity. Used for background treatments, image overlays, and visual graphics."
					title="Gradients"
				/>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="overflow-hidden rounded border border-border">
						<img
							alt="Databuddy gradient background 1"
							className="aspect-video w-full object-cover"
							height={360}
							src="/brand/gradients/gradient-bg-1.jpg"
							width={640}
						/>
					</div>
					<div className="overflow-hidden rounded border border-border">
						<img
							alt="Databuddy gradient background 2"
							className="aspect-video w-full object-cover"
							height={360}
							src="/brand/gradients/gradient-bg-2.jpg"
							width={640}
						/>
					</div>
				</div>
			</section>

			{/* Typography */}
			<section className="mb-16 sm:mb-24" id="typography">
				<SectionHeader
					description="Two typefaces form the Databuddy type system — LT Superior for display and body, and LT Superior Mono for code and technical content."
					title="Typography"
				/>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-4 rounded border border-border p-5">
						<div className="mb-2">
							<p className="mb-1 font-medium text-foreground text-sm">
								LT Superior
							</p>
							<p className="text-muted-foreground text-xs">
								Display & body typeface
							</p>
						</div>
						<div className="space-y-3 border-border border-t pt-4">
							{[
								{ weight: "Light", css: "font-light" },
								{ weight: "Regular", css: "font-normal" },
								{ weight: "Medium", css: "font-medium" },
								{ weight: "Semi Bold", css: "font-semibold" },
								{ weight: "Bold", css: "font-bold" },
								{ weight: "Extra Bold", css: "font-extrabold" },
							].map((w) => (
								<div
									className="flex items-baseline justify-between gap-4"
									key={w.weight}
								>
									<span
										className={cn("text-foreground text-lg sm:text-xl", w.css)}
									>
										AaBbCc123
									</span>
									<span className="shrink-0 text-muted-foreground text-xs">
										{w.weight}
									</span>
								</div>
							))}
						</div>
					</div>

					<div className="flex flex-col gap-4 rounded border border-border p-5">
						<div className="mb-2">
							<p className="mb-1 font-medium text-foreground text-sm">
								LT Superior Mono
							</p>
							<p className="text-muted-foreground text-xs">
								Code & technical typeface
							</p>
						</div>
						<div className="space-y-3 border-border border-t pt-4">
							{[
								{ weight: "Regular", css: "font-normal" },
								{ weight: "Medium", css: "font-medium" },
								{ weight: "Semi Bold", css: "font-semibold" },
								{ weight: "Bold", css: "font-bold" },
							].map((w) => (
								<div
									className="flex items-baseline justify-between gap-4"
									key={w.weight}
								>
									<span
										className={cn(
											"font-mono text-foreground text-lg sm:text-xl",
											w.css
										)}
									>
										AaBbCc123
									</span>
									<span className="shrink-0 text-muted-foreground text-xs">
										{w.weight}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Hierarchy */}
				<div className="mt-6 rounded border border-brand-amber/20 bg-brand-amber/3 p-5">
					<h3 className="mb-4 font-medium text-brand-amber text-sm">
						Type hierarchy
					</h3>
					<div className="space-y-4">
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums sm:w-16">
								H1
							</span>
							<span className="font-extrabold text-2xl text-foreground sm:text-3xl">
								Analytics that runs itself
							</span>
						</div>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums sm:w-16">
								H2
							</span>
							<span className="font-semibold text-foreground text-xl sm:text-2xl">
								Built to run without you
							</span>
						</div>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums sm:w-16">
								H3
							</span>
							<span className="font-medium text-foreground text-lg sm:text-xl">
								Stop babysitting dashboards
							</span>
						</div>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums sm:w-16">
								Body
							</span>
							<span className="text-foreground text-sm sm:text-base">
								Your Databuddy dashboard provides comprehensive analytics
								insights with real-time data and detailed reports.
							</span>
						</div>
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums sm:w-16">
								Caption
							</span>
							<span className="text-muted-foreground text-xs sm:text-sm">
								Privacy-first analytics
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* 8-bit Bunny */}
			<section className="mb-16 sm:mb-24" id="graphic-assets">
				<SectionHeader
					description="The 8-bit bunny adds personality and digital charm. It should live in the background or play a secondary role — never replace the main logomark."
					title="Graphic assets"
				/>

				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					{BUNNY_ASSETS.map((item) => (
						<BrandingAssetCard item={item} key={item.filename} />
					))}
				</div>
			</section>

			{/* Clearspace & sizing */}
			<section className="mb-16 sm:mb-24" id="guidelines">
				<SectionHeader
					description="Maintain consistent clearspace around all logo assets so they're never visually crowded. Never render below the minimum sizes."
					title="Clearspace & minimum sizes"
				/>

				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-brand-purple/20 border-b">
								<th className="py-3 pr-4 font-medium text-brand-purple dark:text-brand-coral">
									Asset
								</th>
								<th className="py-3 pr-4 font-medium text-brand-purple dark:text-brand-coral">
									Clearspace
								</th>
								<th className="py-3 pr-4 font-medium text-brand-purple dark:text-brand-coral">
									Min size
								</th>
								<th className="py-3 font-medium text-brand-purple dark:text-brand-coral">
									Reference
								</th>
							</tr>
						</thead>
						<tbody>
							{CLEARSPACE_RULES.map((rule) => (
								<tr
									className="border-border border-b last:border-b-0"
									key={rule.asset}
								>
									<td className="py-3 pr-4 text-foreground">{rule.asset}</td>
									<td className="py-3 pr-4 font-mono text-muted-foreground text-xs">
										{rule.clearspace}
									</td>
									<td className="py-3 pr-4 font-mono text-muted-foreground text-xs">
										{rule.minSize}
									</td>
									<td className="py-3 text-muted-foreground text-xs">
										{rule.note}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* Do / Don't */}
			<section id="dos-and-donts">
				<SectionHeader
					description="Follow these rules to keep Databuddy's brand consistent and recognizable."
					title="Usage rules"
				/>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="rounded border border-brand-amber/25 bg-brand-amber/4 p-5">
						<p className="mb-3 font-semibold text-brand-amber text-sm">Do</p>
						<ul className="space-y-2 text-foreground text-sm">
							<li>Use official SVGs from this page</li>
							<li>Maintain required clearspace around logos</li>
							<li>Use Deep Black / Off White for text (AAA contrast)</li>
							<li>Use the bunny as a secondary decorative element</li>
							<li>Use brand gradients for backgrounds and overlays</li>
						</ul>
					</div>
					<div className="rounded border border-brand-coral/25 bg-brand-coral/4 p-5">
						<p className="mb-3 font-semibold text-brand-coral text-sm">Don't</p>
						<ul className="space-y-2 text-foreground text-sm">
							<li>Stretch, rotate, or distort any logo assets</li>
							<li>Use the bunny as a replacement for the logomark</li>
							<li>Render logos below their minimum size</li>
							<li>Place logos on busy backgrounds without contrast</li>
							<li>Alter the brand colors or create new palette variations</li>
						</ul>
					</div>
				</div>
			</section>
		</div>
	);
}
