"use client";

import { Button } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";
import { useState } from "react";
import type { NativeRecommendationIntent } from "./recommendation-guards";

type GuideIntent = Extract<
	NativeRecommendationIntent,
	{
		type:
			| "databuddy_setup.guide"
			| "instrumentation.guide"
			| "measurement_gap.guide";
	}
>;

export function RecommendationGuideAction({ action }: { action: GuideIntent }) {
	const [isOpen, setIsOpen] = useState(false);
	const title =
		action.type === "instrumentation.guide"
			? "Add event tracking"
			: action.type === "measurement_gap.guide"
				? "Measure a completed action"
				: "Identify signed-in users";

	return (
		<>
			<Button onClick={() => setIsOpen(true)} size="sm" type="button">
				Review setup
			</Button>
			<Dialog onOpenChange={setIsOpen} open={isOpen}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>{title}</Dialog.Title>
						<Dialog.Description>
							{action.recommendation.action}
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body className="space-y-3">
						{action.type === "instrumentation.guide" ? (
							<InstrumentationGuide action={action} />
						) : action.type === "measurement_gap.guide" ? (
							<MeasurementGapGuide action={action} />
						) : (
							<IdentificationGuide />
						)}
					</Dialog.Body>
					<Dialog.Footer>
						<Button
							onClick={() => setIsOpen(false)}
							type="button"
							variant="secondary"
						>
							Close
						</Button>
					</Dialog.Footer>
					<Dialog.Close />
				</Dialog.Content>
			</Dialog>
		</>
	);
}

function InstrumentationGuide({
	action,
}: {
	action: Extract<GuideIntent, { type: "instrumentation.guide" }>;
}) {
	return (
		<>
			<p className="text-muted-foreground text-sm">
				Emit these events at the completed behavior, then let Databuddy observe
				the new telemetry.
			</p>
			<ul className="space-y-2">
				{action.recommendation.events.map((event) => (
					<li
						className="rounded-md border bg-muted/30 px-3 py-2"
						key={event.name}
					>
						<code className="font-mono text-foreground text-xs">
							track(&quot;{event.name}&quot;)
						</code>
						<p className="mt-1 text-muted-foreground text-xs">
							{event.description}
						</p>
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-xs">
				This recommendation stays current until the new events are observed.
			</p>
		</>
	);
}

function IdentificationGuide() {
	return (
		<>
			<p className="text-muted-foreground text-sm">
				Call identify after authentication with your stable user ID and the
				traits you can safely provide.
			</p>
			<pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-foreground text-xs">
				<code>
					{"identify(user.id, { email: user.email, name: user.name })"}
				</code>
			</pre>
			<p className="text-muted-foreground text-xs">
				This recommendation stays current until Databuddy can observe identified
				users in the affected data.
			</p>
		</>
	);
}

function MeasurementGapGuide({
	action,
}: {
	action: Extract<GuideIntent, { type: "measurement_gap.guide" }>;
}) {
	const route = action.recommendation.route;
	return (
		<>
			<p className="text-muted-foreground text-sm">
				{route
					? `Databuddy observed navigation around ${route}, but a page view does not prove someone completed the important action.`
					: "Databuddy has traffic but no configured goal or funnel, so it cannot yet measure a completed user action."}
			</p>
			<ol className="list-decimal space-y-2 pl-5 text-muted-foreground text-sm">
				<li>Choose the completed behavior that represents real progress.</li>
				<li>Emit one custom event only when that behavior completes.</li>
				<li>After Databuddy observes it, review it as a goal or funnel.</li>
			</ol>
			<p className="text-muted-foreground text-xs">
				This is a guide, not a claim that the route or an event is already a
				conversion.
			</p>
		</>
	);
}
