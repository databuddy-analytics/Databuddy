import {
	LightningSlashIcon,
	RocketLaunchIcon,
	ScalesIcon,
	TrendUpIcon,
} from "@phosphor-icons/react/ssr";

const TEMPLATES = [
	{
		id: "gradual",
		title: "Gradual Rollout",
		description: "Start at 10% and ramp up",
		tag: "rollout",
		tagClass: "bg-white/[0.06] text-muted-foreground",
		Icon: TrendUpIcon,
	},
	{
		id: "ab",
		title: "A/B Test (50/50)",
		description: "Split traffic evenly",
		tag: "experiment",
		tagClass: "bg-amber-500/10 text-amber-300",
		Icon: ScalesIcon,
	},
	{
		id: "kill",
		title: "Kill Switch",
		description: "Disable instantly in production",
		tag: "killswitch",
		tagClass: "bg-red-500/10 text-red-300",
		Icon: LightningSlashIcon,
	},
	{
		id: "beta",
		title: "Beta Program",
		description: "Target early access users",
		tag: "targeting",
		tagClass: "bg-emerald-500/10 text-emerald-300",
		Icon: RocketLaunchIcon,
	},
] as const;

export function FFTemplatesMiniGridDemo() {
	return (
		<div className="relative w-full overflow-hidden">
			<div className="grid w-[115%] grid-cols-2 gap-3">
				{TEMPLATES.map((item) => (
					<div
						className="rounded border border-white/[0.06] bg-white/[0.02] p-4"
						key={item.id}
					>
						<div className="flex items-start gap-2.5">
							<item.Icon
								className="mt-0.5 size-5 shrink-0 text-muted-foreground"
								weight="duotone"
							/>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-foreground text-xs leading-snug">
									{item.title}
								</p>
								<p className="mt-1 text-muted-foreground text-xs leading-snug">
									{item.description}
								</p>
								<span
									className={`mt-2 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${item.tagClass}`}
								>
									{item.tag}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20" />
			<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-background/100 via-background/50 to-transparent sm:w-20" />
		</div>
	);
}
