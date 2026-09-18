"use client";

import type {
	BusinessBrief,
	BusinessContextEdit,
	BusinessContextResearch,
} from "@databuddy/shared/organization-business-context";
import { cn, dayjs } from "@databuddy/ui";
import { Accordion } from "@databuddy/ui/client";
import { ArrowSquareOutIcon, FileTextIcon } from "@databuddy/ui/icons";
import { Streamdown } from "streamdown";

export function BusinessContextMarkdown({
	content,
	streaming = false,
}: {
	content: string;
	streaming?: boolean;
}) {
	return (
		<Streamdown
			className="min-w-0 space-y-4 break-words text-foreground text-sm leading-7 [&_h1]:text-xl [&_h2]:text-base [&_h3]:text-sm [&_pre]:max-w-full [&_pre]:overflow-x-auto"
			mode={streaming ? "streaming" : "static"}
			isAnimating={streaming}
			components={{ img: ({ alt }) => (alt ? <span>{alt}</span> : null) }}
		>
			{content}
		</Streamdown>
	);
}

export function BusinessContextVersion({
	label,
	value,
	sources,
	className,
}: {
	label: string;
	className?: string;
	value: BusinessContextEdit;
	sources: BusinessBrief["sources"];
}) {
	return (
		<section
			className={cn("min-w-0 space-y-5 p-5", className)}
			aria-label={label}
		>
			<h3 className="font-semibold text-sm">{label}</h3>
			{value.content.trim() ? (
				<BusinessContextMarkdown content={value.content} />
			) : (
				<p className="text-muted-foreground text-sm">No business brief.</p>
			)}
			{Object.values(value.teamContext ?? {}).some(Boolean) && (
				<dl className="space-y-3 border-border border-t pt-4 text-sm">
					{[
						["Current priority", value.teamContext?.priority],
						["Success definition", value.teamContext?.successDefinition],
						["Exclusions", value.teamContext?.exclusions],
					].map(([title, text]) =>
						text ? (
							<div key={title}>
								<dt className="font-medium">{title}</dt>
								<dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
									{text}
								</dd>
							</div>
						) : null
					)}
				</dl>
			)}
			{Boolean(value.measurementPlans?.length) && (
				<div className="space-y-3 border-border border-t pt-4 text-sm">
					<h4 className="font-medium">Activation and return</h4>
					{value.measurementPlans?.map((plan) => (
						<div key={plan.websiteId} className="space-y-1">
							<p className="font-medium">{plan.name || "Unnamed outcome"}</p>
							<p className="text-muted-foreground">{plan.domain}</p>
							<p className="break-words">
								<code>{plan.activationEvent}</code> →{" "}
								<code>{plan.returnEvent}</code> within {plan.horizonDays} days
							</p>
							{plan.namespace && (
								<p className="text-muted-foreground">
									Namespace: {plan.namespace}
								</p>
							)}
						</div>
					))}
				</div>
			)}
			<div className="space-y-3 border-border border-t pt-4">
				<h4 className="font-medium text-xs">Sources for this version</h4>
				<BusinessContextSources sources={sources} />
			</div>
		</section>
	);
}

export function BusinessContextSources({
	sources,
}: {
	sources: BusinessBrief["sources"];
}) {
	const links = sources.filter(
		({ url }) => url.startsWith("https://") || url.startsWith("http://")
	);
	if (!links.length) {
		return (
			<p className="text-muted-foreground text-xs leading-5">
				No public sources attached. Your team can write or correct the brief
				directly.
			</p>
		);
	}
	return (
		<ul className="divide-y divide-border">
			{links.map(({ url, title, fetchedAt }) => {
				const source = new URL(url);
				return (
					<li key={url} className="py-3 first:pt-0 last:pb-0">
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex min-w-0 items-start gap-2 text-xs hover:underline"
						>
							<FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<span className="min-w-0 flex-1">
								<span className="block break-words font-medium">
									{title || source.hostname}
								</span>
								<span className="mt-1 block break-all text-muted-foreground">
									{source.hostname}
									{source.pathname === "/" ? "" : source.pathname}
								</span>
							</span>
							<ArrowSquareOutIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
						</a>
						{fetchedAt && (
							<p className="mt-1 pl-6 text-muted-foreground text-xs">
								<time
									dateTime={fetchedAt}
									title={dayjs(fetchedAt).format("MMM D, YYYY [at] h:mm A")}
								>
									Read {dayjs(fetchedAt).fromNow()}
								</time>
							</p>
						)}
					</li>
				);
			})}
		</ul>
	);
}

export function BusinessContextResearchReport({
	research,
	active,
	label,
}: {
	research?: BusinessContextResearch;
	active: boolean;
	label: string;
}) {
	const pages = research?.pages ?? [];
	const read = pages.filter((page) => page.status === "read").length;
	const failed = pages.length - read;
	return (
		<section
			className="space-y-3 border-border border-t px-1 pt-5"
			aria-label={label}
		>
			<h2 className="font-semibold text-xs">{label}</h2>
			<div
				className="min-h-10 text-muted-foreground text-xs leading-5"
				role="status"
			>
				<p>
					{pages.length
						? `${read} ${read === 1 ? "page" : "pages"} read${failed ? ` · ${failed} could not be read` : ""}`
						: active
							? "Opening your website…"
							: "No pages were read."}
				</p>
				<p>
					{research?.discoveryFailed
						? "Additional page discovery was unavailable."
						: "Coverage is limited to the pages listed here."}
				</p>
			</div>
			<Accordion>
				<Accordion.Trigger>
					Pages checked{pages.length ? ` (${pages.length})` : ""}
				</Accordion.Trigger>
				<Accordion.Content className="h-48 space-y-3 overflow-y-auto">
					{pages.length ? (
						<ul className="space-y-3 text-xs">
							{pages.map((page) => (
								<li key={page.url} className="space-y-1">
									<a
										className="block break-all hover:underline"
										href={page.url}
										target="_blank"
										rel="noopener noreferrer"
									>
										{page.title || page.url}
									</a>
									<p
										className={
											page.status === "read"
												? "text-muted-foreground"
												: "text-warning"
										}
									>
										{page.status === "read"
											? "Read"
											: "Could not read this page"}
									</p>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-xs leading-5">
							{active
								? "Page results will appear as research progresses."
								: "No page results were recorded."}
						</p>
					)}
					{research?.discoveryFailed && (
						<p className="text-muted-foreground text-xs leading-5">
							Additional pages could not be discovered. You can add specific
							page URLs and try again.
						</p>
					)}
					{research && (
						<p className="text-muted-foreground text-xs leading-5">
							<time
								dateTime={research.startedAt}
								title={dayjs(research.startedAt).format(
									"MMM D, YYYY [at] h:mm A"
								)}
							>
								Started {dayjs(research.startedAt).fromNow()}.
							</time>
						</p>
					)}
				</Accordion.Content>
			</Accordion>
		</section>
	);
}
