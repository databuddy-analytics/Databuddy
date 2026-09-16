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
					className="mx-auto w-full max-w-6xl space-y-6 p-5"
					data-testid="business-context-page"
				>
					<header className="space-y-2">
						<h1 className="font-semibold text-xl tracking-tight">
							Business context
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm leading-6">
							Help Databuddy understand your business, focus on the right
							outcomes, and interpret your analytics.
						</p>
					</header>
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
		<Card.Header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
			<Card.Title>Business brief</Card.Title>
			{children}
			<Card.Description className="col-span-2">
				Shared across this organization. Changes apply when saved.
			</Card.Description>
		</Card.Header>
	);
}

export function BusinessContextResearchCard({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<Card data-testid="business-context-research">
			<Card.Header>
				<Card.Title>Research your business</Card.Title>
				<Card.Description>
					Create a draft from your public website and documentation.
				</Card.Description>
			</Card.Header>
			<Card.Content className="space-y-4">{children}</Card.Content>
		</Card>
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
			<Field.Label>
				Additional pages{" "}
				<span className="font-normal text-muted-foreground">(optional)</span>
			</Field.Label>
			<Textarea
				value={value}
				onChange={(event) => onChange?.(event.target.value)}
				readOnly={readOnly}
				minRows={3}
				maxRows={3}
				placeholder={
					"https://example.com/pricing\nhttps://docs.example.com/start"
				}
				className="text-xs"
			/>
			<Field.Description>
				Up to six URLs, one per line. Include your pricing, setup guide, or
				product documentation.
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
			<div
				className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]"
				inert
			>
				<Card className="min-w-0" data-testid="business-context-brief">
					<BusinessContextBriefHeader>
						<Badge variant="muted">Loading…</Badge>
					</BusinessContextBriefHeader>
					<div className="flex min-h-12 items-center border-border border-b px-5">
						<Skeleton className="h-7 w-40" />
					</div>
					<div
						className="h-112 space-y-5 p-5 sm:p-6"
						data-testid="business-context-document"
					>
						<Skeleton className="h-5 w-1/2" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
						<Skeleton className="h-4 w-3/4" />
					</div>
					<div className="flex min-h-16 items-center border-border border-t px-5 py-3">
						<Skeleton className="h-3 w-32" />
					</div>
				</Card>
				<aside className="min-w-0 space-y-5">
					<BusinessContextResearchCard>
						<Skeleton className="h-8 w-full" />
						<BusinessContextSourceInput value="" readOnly />
						<div className="min-h-20 space-y-2">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-3/4" />
						</div>
						<Skeleton className="h-8 w-full" />
						<div className="min-h-8" />
						<p className="text-muted-foreground text-xs leading-5">
							You can always write, edit, and save business context manually.
						</p>
					</BusinessContextResearchCard>
					<div className="space-y-3 px-1">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-32 w-full" />
					</div>
				</aside>
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
