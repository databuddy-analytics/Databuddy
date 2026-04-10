import { cn } from "@/lib/utils";

const TH =
	"px-2 py-2 text-left font-medium font-mono text-xs text-muted-foreground capitalize";
const TH_RIGHT =
	"px-2 py-2 text-right font-medium font-mono text-xs text-muted-foreground capitalize";

const ROWS: {
	label: string;
	occurrences: string;
	users: string;
	tone: "red" | "amber" | "muted";
	highlight?: boolean;
}[] = [
	{
		label: "TypeError: cannot read 'user.id'",
		occurrences: "2,431",
		users: "159",
		tone: "red",
		highlight: true,
	},
	{
		label: "NetworkError: fetch failed on /api",
		occurrences: "412",
		users: "69",
		tone: "amber",
	},
	{
		label: "Hydration mismatch on /dashboard",
		occurrences: "38",
		users: "12",
		tone: "muted",
	},
	{
		label: "ReactError: Minified React error #418",
		occurrences: "12",
		users: "2",
		tone: "muted",
	},
];

export function ErrorImpactTableArtifact() {
	return (
		<section
			aria-hidden
			className="relative overflow-hidden rounded backdrop-blur-sm"
		>
			{/* Masked border — same as ErrorPerPageBreakdownDemo */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 z-0 rounded border border-border/50 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_40%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,black_40%,transparent_100%)]"
			/>
			<div className="relative">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[360px] border-collapse text-left">
						<thead>
							<tr className="border-border/40 border-b bg-background/35">
								<th className={TH} scope="col">
									Error
								</th>
								<th className={TH_RIGHT} scope="col">
									Occurrences
								</th>
								<th className={TH_RIGHT} scope="col">
									Users
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/40 bg-background/25">
							{ROWS.map((row) => (
								<tr
									className={cn(
										"hover:bg-muted/10",
										row.highlight && "bg-red-950/45 hover:bg-red-950/55"
									)}
									key={row.label}
								>
									<td
										className={cn(
											"px-2 py-2 font-mono text-xs",
											row.tone === "red" && "text-red-400",
											row.tone === "amber" && "text-amber-300",
											row.tone === "muted" && "text-foreground"
										)}
									>
										{row.label}
									</td>
									<td className="px-2 py-2 text-right font-mono text-muted-foreground text-xs tabular-nums">
										{row.occurrences}
									</td>
									<td
										className={cn(
											"px-2 py-2 text-right font-mono text-xs tabular-nums",
											row.tone === "red" && "text-red-400",
											row.tone === "amber" && "text-amber-300",
											row.tone === "muted" && "text-muted-foreground"
										)}
									>
										{row.users}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{/* Bottom fade */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-linear-to-t from-background/100 via-background/60 to-transparent"
				/>
			</div>
		</section>
	);
}

const RELEASES: { version: string; status: string; tone: "good" | "bad" }[] = [
	{ version: "v1.2.3", status: "stable", tone: "good" },
	{ version: "v1.2.4", status: "14 new errors", tone: "bad" },
	{ version: "v1.2.5", status: "resolved", tone: "good" },
];

export function ReleaseTimelineArtifact() {
	return (
		<div className="w-full px-3 py-2 font-mono sm:px-4 sm:py-3">
			<ul className="relative">
				{RELEASES.map((rel, index) => (
					<li className="relative flex gap-3 pb-5 last:pb-0" key={rel.version}>
						{index < RELEASES.length - 1 ? (
							<div
								aria-hidden
								className="absolute top-[14px] bottom-0 left-[7px] w-px bg-border/60"
							/>
						) : null}
						<span
							aria-hidden
							className={cn(
								"relative z-10 mt-0.5 size-2 shrink-0 rounded-full border border-card ring-1 ring-border/40",
								rel.tone === "bad" ? "bg-red-500" : "bg-emerald-500"
							)}
						/>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<span className="text-foreground text-xs">{rel.version}</span>
								{rel.tone === "bad" ? (
									<span className="text-red-400 text-xs">{rel.status}</span>
								) : (
									<span className="text-muted-foreground text-xs">
										{rel.status}
									</span>
								)}
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
