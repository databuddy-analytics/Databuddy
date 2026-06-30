import {
	SiFathom,
	SiGoogleanalytics,
	SiMatomo,
	SiMixpanel,
	SiPlausibleanalytics,
	SiPosthog,
	SiUmami,
} from "@icons-pack/react-simple-icons";
import { ChartLineIcon } from "@databuddy/ui/icons";
import Image from "next/image";
import type { ReactNode } from "react";
import { AmplitudeMarkIcon } from "@/components/compare/amplitude-mark-icon";

const ICON_SIZE = 22;

const ICON_FILL: Record<string, string> = {
	posthog: "#000000",
};

function iconFillForSlug(slug: string): string {
	return ICON_FILL[slug] ?? "#ffffff";
}

const SLUG_ICONS: Record<
	string,
	(props: { title: string; fill: string }) => ReactNode
> = {
	"google-analytics": ({ title, fill }) => (
		<SiGoogleanalytics color={fill} size={ICON_SIZE} title={title} />
	),
	plausible: ({ title, fill }) => (
		<SiPlausibleanalytics color={fill} size={ICON_SIZE} title={title} />
	),
	fathom: ({ title, fill }) => (
		<SiFathom color={fill} size={ICON_SIZE} title={title} />
	),
	posthog: ({ title, fill }) => (
		<SiPosthog color={fill} size={ICON_SIZE} title={title} />
	),
	umami: ({ title, fill }) => (
		<SiUmami color={fill} size={ICON_SIZE} title={title} />
	),
	mixpanel: ({ title, fill }) => (
		<SiMixpanel color={fill} size={ICON_SIZE} title={title} />
	),
	matomo: ({ title, fill }) => (
		<SiMatomo color={fill} size={ICON_SIZE} title={title} />
	),
};

export function CompetitorBrandAvatar({
	slug,
	name,
	color,
}: {
	slug: string;
	name: string;
	color: string;
}) {
	if (slug === "amplitude") {
		return (
			<div
				className="flex size-10 shrink-0 items-center justify-center rounded"
				style={{ backgroundColor: color }}
			>
				<AmplitudeMarkIcon className="text-white" title={name} />
			</div>
		);
	}

	if (slug === "rybbit") {
		return (
			<div
				className="flex size-10 shrink-0 items-center justify-center rounded"
				style={{ backgroundColor: color }}
			>
				<Image
					alt=""
					aria-hidden
					className="size-[22px]"
					height={22}
					src="/brand-icons/rybbit-frog-white.svg"
					unoptimized
					width={22}
				/>
			</div>
		);
	}

	const fill = iconFillForSlug(slug);
	const renderIcon = SLUG_ICONS[slug];
	const icon = renderIcon ? (
		renderIcon({ title: name, fill })
	) : (
		<ChartLineIcon aria-hidden className="size-5 text-white" weight="duotone" />
	);

	return (
		<div
			className="flex size-10 shrink-0 items-center justify-center rounded"
			style={{ backgroundColor: color }}
		>
			{icon}
		</div>
	);
}
