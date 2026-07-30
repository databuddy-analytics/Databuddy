"use client";

type IconWeight = "regular" | "bold" | "fill" | "duotone";

import { CodeIcon, TargetIcon } from "@databuddy/ui/icons";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";
import {
	type CareerOpening,
	careerOpenings,
} from "./careers-openings-data";

const openingIcons: Record<
	string,
	React.ComponentType<{ className?: string; weight?: IconWeight }>
> = {
	"founding-engineer": CodeIcon,
	sdr: TargetIcon,
};

function BulletList({ items, title }: { items: string[]; title: string }) {
	return (
		<div>
			<h4 className="mb-2 font-semibold text-foreground text-sm">{title}</h4>
			<ul className="space-y-2">
				{items.map((item) => (
					<li
						className="flex gap-2 text-pretty text-muted-foreground text-sm leading-relaxed"
						key={item}
					>
						<span
							aria-hidden
							className="mt-2 size-1 shrink-0 rounded bg-foreground/40"
						/>
						<span>{item}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function OpeningCard({ opening }: { opening: CareerOpening }) {
	const Icon = openingIcons[opening.id] ?? CodeIcon;

	return (
		<SciFiCard variant="primary">
			<article className="relative rounded border border-primary/50 bg-primary/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-8">
				<div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex items-start gap-3">
						<Icon
							className="mt-0.5 size-8 shrink-0 text-primary"
							weight="duotone"
						/>
						<div>
							<h3 className="text-balance font-semibold text-foreground text-xl sm:text-2xl">
								{opening.title}
							</h3>
							<p className="mt-1 text-muted-foreground text-sm tabular-nums">
								{opening.type} · {opening.location}
							</p>
						</div>
					</div>
					<SciFiButton asChild>
						<a href={opening.applyHref}>{opening.applyLabel}</a>
					</SciFiButton>
				</div>

				<p className="mb-8 max-w-3xl text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
					{opening.summary}
				</p>

				<div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
					<BulletList items={opening.responsibilities} title="What you'll do" />
					<BulletList
						items={opening.requirements}
						title="What we're looking for"
					/>
					<BulletList items={opening.niceToHaves} title="Nice to have" />
				</div>
			</article>
		</SciFiCard>
	);
}

export default function CareersOpenings() {
	return (
		<div>
			<div className="mb-12 text-center">
				<h2 className="mb-4 text-balance font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Open roles
				</h2>
				<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					{careerOpenings.length === 1
						? "One opening right now. If it fits, apply directly."
						: "Current openings. If one fits, apply directly."}
				</p>
			</div>

			<div className="space-y-6">
				{careerOpenings.map((opening) => (
					<OpeningCard key={opening.id} opening={opening} />
				))}
			</div>
		</div>
	);
}
