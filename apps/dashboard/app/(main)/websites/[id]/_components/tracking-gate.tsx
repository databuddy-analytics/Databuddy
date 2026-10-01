"use client";

import { Button, Card, Progress } from "@databuddy/ui";
import { GlobeIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	agentProgressSummary,
	ConnectApp,
} from "@/components/websites/connect-app";
import { SetupRow, type SetupRowStatus } from "@/components/websites/setup-row";
import { useAgentInstall } from "@/hooks/use-agent-install";
import { useSiteResearch } from "@/hooks/use-site-research";
import { useWebsite } from "@/hooks/use-websites";

/** Replaces a website's dashboard until its first page view arrives. */
export function WebsiteTrackingGate({ websiteId }: { websiteId: string }) {
	const { activeOrganization } = useOrganizationsContext();
	const { data: website } = useWebsite(websiteId);
	const install = useAgentInstall(websiteId);
	const research = useSiteResearch(
		activeOrganization?.id,
		website ? { id: website.id, domain: website.domain } : null
	);
	const connectStatus: SetupRowStatus = install.verified
		? "done"
		: install.copied
			? "waiting"
			: "active";
	const firstViewStatus: SetupRowStatus = install.verified
		? "done"
		: install.copied
			? "waiting"
			: "pending";
	return (
		<div className="mx-auto w-full max-w-3xl py-2 lg:py-6">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="flex items-center gap-2.5 font-semibold text-xl">
					{website ? (
						<FaviconImage
							altText=""
							className="size-6"
							domain={website.domain}
							fallbackIcon={
								<GlobeIcon
									className="absolute inset-0 m-auto text-muted-foreground"
									size={16}
								/>
							}
							size={24}
						/>
					) : null}
					{website?.name ?? website?.domain ?? "Your website"}
				</h1>
				<Button asChild size="sm" variant="ghost">
					<Link href={`/websites/${websiteId}/settings/tracking`}>
						All install options
					</Link>
				</Button>
			</div>
			<Card className="gap-0 py-0">
				<Card.Header className="gap-3 border-border border-b bg-card px-5 py-4">
					<Card.Title>
						{install.verified
							? "Tracking verified"
							: "No events yet. Two steps to your dashboard."}
					</Card.Title>
					<Progress
						size="sm"
						value={install.verified ? 100 : install.copied ? 50 : 0}
					/>
				</Card.Header>
				<SetupRow
					detail={
						install.verified
							? "Tracking verified"
							: install.agentProgress
								? agentProgressSummary(install.agentProgress)
								: install.copied
									? "Prompt copied"
									: undefined
					}
					expanded={!install.verified}
					status={connectStatus}
					title="Connect your app"
				>
					{website ? (
						<ConnectApp
							agentProgress={install.agentProgress}
							domain={website.domain}
							onCopy={install.markCopied}
							onStartResearch={research.start}
							research={research.research}
							setupSession={install.setupSession}
							tracking={install.tracking}
							websiteId={websiteId}
						/>
					) : null}
				</SetupRow>
				<SetupRow
					detail={
						install.verified
							? "Loading your dashboard"
							: website
								? `Open ${website.domain} once after installing. This page updates on its own.`
								: undefined
					}
					expanded={false}
					status={firstViewStatus}
					title="First page view"
				/>
			</Card>
		</div>
	);
}
