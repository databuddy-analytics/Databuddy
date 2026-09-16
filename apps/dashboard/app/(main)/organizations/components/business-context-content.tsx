"use client";

import type {
	BusinessBrief,
	BusinessContextEdit,
} from "@databuddy/shared/organization-business-context";
import { cn, dayjs } from "@databuddy/ui";
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
			{links.map(({ url, title, fetchedAt }) => (
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
								{title || new URL(url).hostname}
							</span>
							<span className="mt-1 block break-all text-muted-foreground">
								{new URL(url).hostname}
								{new URL(url).pathname === "/" ? "" : new URL(url).pathname}
							</span>
						</span>
						<ArrowSquareOutIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
					</a>
					<p className="mt-1 pl-6 text-muted-foreground text-xs">
						{fetchedAt ? (
							<time
								dateTime={fetchedAt}
								title={dayjs(fetchedAt).format("MMM D, YYYY [at] h:mm A")}
							>
								Read {dayjs(fetchedAt).fromNow()}
							</time>
						) : (
							"Read time unavailable"
						)}
					</p>
				</li>
			))}
		</ul>
	);
}
