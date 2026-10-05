"use client";

import type {
	OnboardingIntent,
	OnboardingWant,
} from "@databuddy/shared/custom-events";
import { Button } from "@databuddy/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const UPTIME_DAYS = Array.from({ length: 45 }, (_, day) => day !== 31);

function Preview({ children }: { children: ReactNode }) {
	return (
		<div className="dotted-bg flex h-44 flex-col border-border border-b bg-accent px-6 pt-6">
			<div className="flex-1 overflow-hidden rounded-t-lg border border-border border-b-0 bg-card px-3.5 pt-3 text-xs shadow-xs">
				{children}
			</div>
		</div>
	);
}

function PreviewHeader({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-2 border-border border-b pb-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}

function PreviewRows({ children }: { children: ReactNode }) {
	return <div className="divide-y divide-border">{children}</div>;
}

function PreviewRow({
	label,
	value,
	icon,
	tone,
}: {
	icon?: ReactNode;
	label: string;
	tone?: "error";
	value: string;
}) {
	return (
		<div className="flex items-center gap-2 py-2">
			{icon}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span
				className={cn(
					"shrink-0 tabular-nums",
					tone === "error" ? "text-destructive" : "text-muted-foreground"
				)}
			>
				{value}
			</span>
		</div>
	);
}

function ConversionsPreview() {
	return (
		<>
			<PreviewHeader label="Pricing to paid" value="$4,210" />
			<div className="space-y-2.5 pt-2.5">
				{[
					["Visited pricing", "2,410", 100],
					["Signed up", "916", 38],
					["Paid", "112", 5],
				].map(([label, count, width]) => (
					<div key={label}>
						<div className="mb-1 flex justify-between gap-2">
							<span>{label}</span>
							<span className="text-muted-foreground tabular-nums">
								{count}
							</span>
						</div>
						<div className="h-1.5 rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-foreground/70"
								style={{ width: `${width}%` }}
							/>
						</div>
					</div>
				))}
			</div>
		</>
	);
}

function PerformancePreview() {
	return (
		<>
			<PreviewHeader label="/checkout" value="Fast" />
			<div className="grid grid-cols-3 divide-x divide-border border-border border-b py-2">
				{[
					["LCP", "1.8s"],
					["INP", "120ms"],
					["CLS", "0.02"],
				].map(([metric, value]) => (
					<div className="px-2 first:pl-0" key={metric}>
						<p className="text-muted-foreground">{metric}</p>
						<p className="font-medium text-success tabular-nums">{value}</p>
					</div>
				))}
			</div>
			<PreviewRows>
				<PreviewRow
					label="TypeError: cart is undefined"
					tone="error"
					value="24 users"
				/>
				<PreviewRow label="/pricing is slow on mobile" value="LCP 4.1s" />
			</PreviewRows>
		</>
	);
}

function AiAgentsPreview() {
	return (
		<>
			<PreviewHeader label="AI this week" value="2,589 reads" />
			<PreviewRows>
				{[
					["Claude", "Claude Code read /llms.txt", "86", false],
					["ChatGPT", "GPTBot crawled /docs", "1,204", true],
					["Perplexity", "Perplexity sent visitors", "41", false],
				].map(([icon, label, value, invert]) => (
					<PreviewRow
						icon={
							<img
								alt=""
								className={cn("size-3.5", invert && "dark:invert")}
								height={14}
								src={`/ai/${icon}.svg`}
								width={14}
							/>
						}
						key={String(label)}
						label={String(label)}
						value={String(value)}
					/>
				))}
			</PreviewRows>
		</>
	);
}

function UptimePreview() {
	return (
		<>
			<PreviewHeader label="acme.com" value="99.98% up" />
			<div className="mt-2.5 flex h-9 gap-0.5">
				{UPTIME_DAYS.map((up, day) => (
					<span
						className={cn(
							"flex-1 rounded-[2px]",
							up ? "bg-success/60" : "bg-destructive"
						)}
						key={day}
					/>
				))}
			</div>
			<div className="mt-1.5 flex justify-between text-muted-foreground">
				<span>45 days ago</span>
				<span>Today</span>
			</div>
			<PreviewRow label="Outage on Sep 21" tone="error" value="4 min" />
		</>
	);
}

function LinksPreview() {
	return (
		<>
			<PreviewHeader label="Clicks this week" value="3,714" />
			<PreviewRows>
				<PreviewRow label="dby.sh/launch" value="2,341" />
				<PreviewRow label="dby.sh/newsletter" value="918" />
				<PreviewRow label="dby.sh/podcast" value="455" />
			</PreviewRows>
		</>
	);
}

function McpPreview() {
	return (
		<>
			<PreviewHeader label="Tool calls today" value="623" />
			<PreviewRows>
				<PreviewRow label="search_docs" value="412" />
				<PreviewRow label="get_page" value="208" />
				<PreviewRow label="create_ticket" tone="error" value="3 failed" />
			</PreviewRows>
		</>
	);
}

export const WANT_OPTIONS: {
	description: string;
	id: OnboardingWant;
	intent?: OnboardingIntent;
	name: string;
	path?: string;
	preview?: () => ReactNode;
	priority: string;
}[] = [
	{
		id: "analytics",
		name: "Web analytics",
		description: "Where visitors come from and which pages they read.",
		intent: "traffic",
		priority:
			"Understand which channels bring visitors and which ones are growing.",
	},
	{
		id: "conversions",
		name: "Sign-ups and revenue",
		description:
			"Goals, funnels, drop-off, and which channels bring paying customers.",
		preview: ConversionsPreview,
		intent: "conversions",
		path: "/goals",
		priority:
			"Know whether visitors sign up or buy, where they drop off, and which channels bring paying customers.",
	},
	{
		id: "performance",
		name: "Speed and errors",
		description:
			"Real-user page speed and JavaScript errors, by page and browser.",
		preview: PerformancePreview,
		intent: "performance",
		path: "/vitals",
		priority: "Catch slow pages and JavaScript errors before users complain.",
	},
	{
		id: "ai_visibility",
		name: "AI agents",
		description:
			"Crawlers, coding agents like Claude Code, llms.txt reads, and the visitors AI sends you.",
		preview: AiAgentsPreview,
		intent: "ai_visibility",
		path: "/agents",
		priority: "See which AI crawlers read the site and what they take.",
	},
	{
		id: "uptime",
		name: "Uptime",
		description:
			"Checks every few minutes, outage history, and a public status page.",
		preview: UptimePreview,
		priority: "Know the moment the site goes down.",
	},
	{
		id: "links",
		name: "Short links",
		description:
			"Short links with every click broken down by source, country, and device.",
		preview: LinksPreview,
		priority: "Measure the links shared in campaigns and posts.",
	},
	{
		id: "mcp",
		name: "MCP analytics",
		description:
			"Tool calls, latency, and failures from every AI client on your server.",
		preview: McpPreview,
		priority: "See how AI clients use the MCP server.",
	},
];

export const WANT_IDS = WANT_OPTIONS.map((option) => option.id);

export function priorityFor(wants: OnboardingWant[]): string {
	return WANT_OPTIONS.filter((option) => wants.includes(option.id))
		.map((option) => option.priority)
		.join(" ");
}

/** The first analytics pick past plain traffic decides where the dashboard opens. */
export function primaryWant(wants: OnboardingWant[]) {
	return (
		WANT_OPTIONS.find(
			(option) =>
				option.id !== "analytics" && option.path && wants.includes(option.id)
		) ?? WANT_OPTIONS[0]
	);
}

interface WhatMattersProps {
	onContinue: () => void;
	onSkipSetup: () => void;
	onToggle: (want: OnboardingWant) => void;
	selected: OnboardingWant[];
}

export function WhatMatters({
	onContinue,
	onSkipSetup,
	onToggle,
	selected,
}: WhatMattersProps) {
	const options = WANT_OPTIONS.filter((option) => option.id !== "analytics");
	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
				<div className="mb-8 flex items-start justify-between gap-4">
					<div>
						<h1 className="text-balance font-semibold text-2xl">
							What do you want from Databuddy?
						</h1>
						<p className="mt-1.5 text-pretty text-muted-foreground">
							Pick what you care about. We set up those first.
						</p>
					</div>
					<Button onClick={onSkipSetup} size="sm" variant="ghost">
						Skip setup
					</Button>
				</div>
				<div className="flex flex-wrap justify-center gap-4">
					{options.map((option) => {
						const checked = selected.includes(option.id);
						return (
							<Button
								aria-pressed={checked}
								className={cn(
									"h-auto w-full flex-col items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-xl border bg-card p-0 text-left font-normal text-foreground hover:bg-card hover:text-foreground active:scale-100 active:bg-card active:text-foreground sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]",
									checked
										? "border-foreground ring-1 ring-foreground"
										: "border-border hover:border-foreground/30"
								)}
								key={option.id}
								onClick={() => onToggle(option.id)}
								variant="ghost"
							>
								{option.preview ? (
									<Preview>
										<option.preview />
									</Preview>
								) : null}
								<span className="block px-5 pt-4 pb-5">
									<span className="block font-semibold">{option.name}</span>
									<span className="mt-1 block text-pretty text-muted-foreground text-sm">
										{option.description}
									</span>
								</span>
							</Button>
						);
					})}
				</div>
				<div className="mt-8 flex justify-end">
					<Button onClick={onContinue} size="lg">
						Continue
					</Button>
				</div>
			</div>
		</div>
	);
}
