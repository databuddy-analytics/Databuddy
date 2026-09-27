"use client";

import { Badge, Button, Card, Field, Skeleton, Textarea } from "@databuddy/ui";
import { FloppyDiskIcon } from "@databuddy/ui/icons";
import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/top-bar";

export function BusinessContextLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<TopBar.Breadcrumbs
				items={[
					{ label: "Settings", href: "/organizations/settings" },
					{ label: "Business Context" },
				]}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
				<div
					className="mx-auto w-full max-w-4xl p-5"
					data-testid="business-context-page"
				>
					{children}
				</div>
			</div>
		</div>
	);
}

export function BusinessContextBriefHeader({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<Card.Header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-3">
			<Card.Title>Business brief</Card.Title>
			{children}
		</Card.Header>
	);
}

export function BusinessContextSourceInput({
	value,
	onChange,
	readOnly,
	error,
}: {
	value: string;
	onChange?: (value: string) => void;
	readOnly: boolean;
	error?: string;
}) {
	return (
		<Field error={Boolean(error)}>
			<Field.Label>Additional pages</Field.Label>
			<Textarea
				value={value}
				onChange={(event) => onChange?.(event.target.value)}
				readOnly={readOnly}
				minRows={2}
				maxRows={4}
				className="min-h-16 text-xs"
			/>
			<Field.Description>
				Pricing, docs, or setup guides. Up to six URLs, one per line.
			</Field.Description>
			{error && <Field.Error>{error}</Field.Error>}
		</Field>
	);
}

export function BusinessContextLoading() {
	return (
		<div aria-label="Loading business context" role="status">
			<TopBar.Actions>
				<Button aria-label="Discard changes" disabled size="sm" variant="ghost">
					Discard<span className="hidden sm:inline"> changes</span>
				</Button>
				<Button
					aria-label="Save changes"
					disabled
					size="sm"
					keyboard={{
						display: "⌘S",
						trigger: () => false,
						callback: () => undefined,
					}}
				>
					<FloppyDiskIcon className="hidden size-4 sm:block" />
					Save<span className="hidden sm:inline"> changes</span>
				</Button>
			</TopBar.Actions>
			<div className="flex min-w-0 flex-col gap-4" inert>
				<Card className="min-w-0" data-testid="business-context-brief">
					<BusinessContextBriefHeader>
						<Badge variant="muted">Loading…</Badge>
					</BusinessContextBriefHeader>
					<div className="flex min-h-12 items-center border-border border-b px-5">
						<Skeleton className="h-7 w-40" />
					</div>
					<div
						className="space-y-4 p-5 sm:p-6"
						data-testid="business-context-document"
					>
						<Skeleton className="h-5 w-1/2" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
						<Skeleton className="h-4 w-3/4" />
					</div>
					<div className="flex min-h-12 items-center border-border border-t px-5 py-2">
						<Skeleton className="h-3 w-32" />
					</div>
				</Card>
			</div>
		</div>
	);
}

export function BusinessContextSkeleton() {
	return (
		<BusinessContextLayout>
			<BusinessContextLoading />
		</BusinessContextLayout>
	);
}
