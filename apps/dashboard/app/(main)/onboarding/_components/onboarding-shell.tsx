"use client";

import { Button, Card, StatusDot } from "@databuddy/ui";
import { ArrowLeftIcon } from "@databuddy/ui/icons";
import type { ReactNode } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface OnboardingShellProps {
	back?: (() => void) | null;
	children: ReactNode;
	next?: {
		disabled?: boolean;
		label: string;
		loading?: boolean;
		onClick: () => void;
	} | null;
	onSkip: () => void;
	step: number;
}

export function OnboardingShell({
	back,
	children,
	next,
	onSkip,
	step,
}: OnboardingShellProps) {
	return (
		<div className="h-full overflow-y-auto">
			<div className="flex min-h-full px-4 py-6 sm:px-6">
				<Card className="mx-auto my-auto w-full max-w-2xl gap-0 self-center justify-self-center py-0">
					<Card.Header className="flex-row items-center justify-between border-border border-b px-6 py-2.5">
						<p className="text-muted-foreground text-xs tabular-nums">
							Step {step} of 3
						</p>
						<Button onClick={onSkip} size="sm" variant="ghost">
							Skip setup
						</Button>
					</Card.Header>
					<Card.Content className="px-6 py-7">{children}</Card.Content>
					{back || next ? (
						<Card.Footer className="justify-between border-border border-t px-6 py-4">
							{back ? (
								<Button onClick={back} size="sm" variant="ghost">
									<ArrowLeftIcon className="size-3.5" />
									Back
								</Button>
							) : (
								<span />
							)}
							{next ? (
								<Button
									disabled={next.disabled}
									loading={next.loading}
									onClick={next.onClick}
								>
									{next.label}
								</Button>
							) : null}
						</Card.Footer>
					) : null}
				</Card>
			</div>
		</div>
	);
}

export function OnboardingStepHeader({
	description,
	title,
}: {
	description: ReactNode;
	title: string;
}) {
	return (
		<div className="mb-7 space-y-2">
			<h1 className="text-balance font-semibold text-2xl">{title}</h1>
			<p className="text-pretty text-muted-foreground text-sm leading-6">
				{description}
			</p>
		</div>
	);
}

export function StatusRow({
	active = false,
	color,
	detail,
	title,
}: {
	active?: boolean;
	color: "destructive" | "info" | "muted" | "success" | "warning";
	detail: ReactNode;
	title: string;
}) {
	return (
		<div className="flex items-start gap-3" role="status">
			<StatusDot
				className="mt-1.5 shrink-0"
				color={color}
				pulse={active}
				size="sm"
			/>
			<div className="min-w-0 space-y-0.5">
				{active ? (
					<Shimmer className="font-medium text-sm">{title}</Shimmer>
				) : (
					<p className="font-medium text-sm">{title}</p>
				)}
				<p className="text-pretty text-muted-foreground text-xs">{detail}</p>
			</div>
		</div>
	);
}

export function ResearchPanel({
	children,
	domain,
	pagesRead,
	phase,
}: {
	children?: ReactNode;
	domain: string | null;
	pagesRead: number;
	phase: "failed" | "idle" | "reading" | "ready" | "unavailable" | "writing";
}) {
	if (phase === "idle" || phase === "unavailable" || !domain) {
		return null;
	}
	const pages = `${pagesRead} ${pagesRead === 1 ? "page" : "pages"}`;
	const active = phase === "reading" || phase === "writing";
	const title =
		phase === "reading"
			? `Reading ${domain}`
			: phase === "writing"
				? `Writing a brief about ${domain}`
				: phase === "ready"
					? `Read ${pages} on ${domain}`
					: `Couldn't read ${domain}`;
	const detail =
		phase === "reading"
			? pagesRead > 0
				? `${pages} read so far`
				: "Opening the homepage and the pages it links to"
			: phase === "writing"
				? "Turning what it found into a short brief"
				: phase === "ready"
					? "The brief is ready"
					: "You can answer one question instead";
	return (
		<div className="rounded border border-border bg-card" role="status">
			<div className="space-y-1 px-4 py-3">
				{active ? (
					<Shimmer className="font-medium text-sm">{title}</Shimmer>
				) : (
					<p className="font-medium text-sm">{title}</p>
				)}
				<p className="text-muted-foreground text-xs">{detail}</p>
			</div>
			{children ? (
				<div className="border-border border-t px-4 py-3">{children}</div>
			) : null}
		</div>
	);
}
