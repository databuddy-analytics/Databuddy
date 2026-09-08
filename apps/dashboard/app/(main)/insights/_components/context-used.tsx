"use client";

import type {
	BusinessContext,
	BusinessSource,
} from "@databuddy/shared/insights";
import { formatDateTime } from "@databuddy/ui";
import { Accordion } from "@databuddy/ui/client";

export function ContextUsed({ snapshot }: { snapshot?: BusinessContext }) {
	if (!snapshot) {
		return null;
	}
	return (
		<Accordion>
			<Accordion.Trigger className="bg-transparent px-2">
				Business context
			</Accordion.Trigger>
			<Accordion.Content className="space-y-3 px-2 text-muted-foreground text-xs">
				<p>
					Background available for this update. This snapshot does not identify
					which facts influenced individual claims.
				</p>
				<p>
					Captured{" "}
					<time dateTime={snapshot.capturedAt}>
						{formatDateTime(snapshot.capturedAt)}
					</time>
				</p>
				{snapshot.status === "partial" && (
					<p>Some context was unavailable or omitted.</p>
				)}
				{snapshot.sources.length === 0 && (
					<p>
						{snapshot.status === "unavailable"
							? "Business context was unavailable for this update."
							: "No business context sources were supplied for this update."}
					</p>
				)}
				<ul className="space-y-4">
					{snapshot.sources.map((source) => (
						<li className="min-w-0 space-y-1" key={source.id}>
							<p className="font-medium text-foreground">
								{sourceName(source)}
							</p>
							{source.kind === "organization_profile" && source.author && (
								<p>{source.author}</p>
							)}
							<p>
								{source.profileVersion
									? `Revision ${source.profileVersion.revision} · Saved `
									: "Recorded "}
								<time
									dateTime={
										source.profileVersion?.updatedAt ?? source.observedAt
									}
								>
									{formatDateTime(
										source.profileVersion?.updatedAt ?? source.observedAt
									)}
								</time>
							</p>
							<p className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">
								{source.content}
							</p>
							{source.url && <SourceLink url={source.url} title={source.url} />}
							{Boolean(source.references?.length) && (
								<div className="space-y-1 pt-1">
									<p>Source links</p>
									<ul className="space-y-1">
										{source.references?.map((reference) => (
											<li key={reference.url}>
												<SourceLink {...reference} />
											</li>
										))}
									</ul>
								</div>
							)}
						</li>
					))}
				</ul>
			</Accordion.Content>
		</Accordion>
	);
}

function sourceName(source: BusinessSource) {
	if (source.kind === "organization_profile") {
		return source.origin === "website"
			? "Organization brief · Website background"
			: source.origin === "mixed"
				? "Organization brief · Website background with team edits"
				: source.origin === "team"
					? "Organization brief · Team supplied or edited"
					: "Organization brief";
	}
	return source.kind === "team_reply"
		? `Team reply${source.author ? ` · ${source.author}` : ""}`
		: "Website excerpt";
}

function SourceLink({ url, title }: { url: string; title: string }) {
	const protocol = new URL(url).protocol;
	if (protocol !== "https:" && protocol !== "http:") {
		return <span className="break-all">{title || url}</span>;
	}
	return (
		<a
			className="break-all underline underline-offset-2 hover:text-foreground"
			href={url}
			rel="noopener noreferrer"
			target="_blank"
			title={url}
		>
			{title || url}
		</a>
	);
}
