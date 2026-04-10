import { cn } from "@/lib/utils";

type StatusTone = "critical" | "warning" | "good";

const STATUS_STYLES: Record<
	StatusTone,
	{ badge: string; text: string; border: string }
> = {
	critical: {
		badge: "bg-red-500/10",
		text: "text-red-300",
		border: "border-red-500/35",
	},
	warning: {
		badge: "bg-amber-500/10",
		text: "text-amber-300",
		border: "border-amber-500/35",
	},
	good: {
		badge: "bg-emerald-500/10",
		text: "text-emerald-300",
		border: "border-emerald-500/35",
	},
};

const ROWS: {
	page: string;
	errors: string;
	users: string;
	rate: string;
	status: string;
	tone: StatusTone;
	highlight?: boolean;
}[] = [
	{
		page: "/checkout",
		errors: "2,431",
		users: "159",
		rate: "18.4%",
		status: "Critical",
		tone: "critical",
		highlight: true,
	},
	{
		page: "/pricing",
		errors: "412",
		users: "69",
		rate: "4.1%",
		status: "Investigate",
		tone: "warning",
	},
	{
		page: "/login",
		errors: "188",
		users: "47",
		rate: "2.6%",
		status: "Monitor",
		tone: "warning",
	},
	{
		page: "/blog",
		errors: "73",
		users: "29",
		rate: "0.8%",
		status: "OK",
		tone: "good",
	},
] as const;

const TH =
	"px-2 py-2 text-left font-medium font-mono text-xs text-muted-foreground capitalize";
const TH_RIGHT =
	"px-2 py-2 text-right font-medium font-mono text-xs text-muted-foreground capitalize";

export function ErrorPerPageBreakdownDemo() {
	return (
		<section
			aria-hidden
			className="relative overflow-hidden rounded backdrop-blur-sm"
		>
			{/* Border with bottom fade-out mask — same as WebVitalsBreakdownDemo */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 z-0 rounded border border-border/50 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_40%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,black_40%,transparent_100%)]"
			/>

			{/* Content wrapper: relative only, overflow-x-auto on inner div */}
			<div className="relative">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[480px] border-collapse text-left">
						<thead>
							<tr className="border-border/40 border-b bg-background/35">
								<th className={TH} scope="col">
									Page
								</th>
								<th className={TH_RIGHT} scope="col">
									Errors
								</th>
								<th className={TH_RIGHT} scope="col">
									Users
								</th>
								<th className={TH_RIGHT} scope="col">
									Rate
								</th>
								<th className={TH_RIGHT} scope="col">
									Status
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/40 bg-background/25">
							{ROWS.map((row) => {
								const styles = STATUS_STYLES[row.tone];
								return (
									<tr
										className={cn(
											"hover:bg-muted/10",
											row.highlight && "bg-red-950/45 hover:bg-red-950/55"
										)}
										key={row.page}
									>
										<td
											className={cn(
												"max-w-[120px] truncate px-2 py-2 font-mono text-xs",
												row.highlight ? "text-red-400" : "text-foreground"
											)}
										>
											{row.page}
										</td>
										<td className="px-2 py-2 text-right font-mono text-muted-foreground text-xs tabular-nums">
											{row.errors}
										</td>
										<td className="px-2 py-2 text-right font-mono text-muted-foreground text-xs tabular-nums">
											{row.users}
										</td>
										<td
											className={cn(
												"px-2 py-2 text-right font-mono text-xs tabular-nums",
												row.tone === "critical" && "text-red-300",
												row.tone === "warning" && "text-amber-300",
												row.tone === "good" && "text-emerald-300"
											)}
										>
											{row.rate}
										</td>
										<td className="px-2 py-2 text-right">
											<span
												className={cn(
													"inline-flex items-center rounded border px-1.5 py-0.5 font-medium font-mono text-[9px] uppercase tracking-wide",
													styles.border,
													styles.badge,
													styles.text
												)}
											>
												{row.status}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				{/* Bottom fade — inside relative div, same as WebVitalsBreakdownDemo */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-linear-to-t from-background/100 via-background/60 to-transparent"
				/>
			</div>
		</section>
	);
}
