"use client";

import type { Icon } from "@phosphor-icons/react";
import { useState } from "react";
import { LinkSheet } from "@/app/(main)/links/_components/link-sheet";
import { useChat } from "@/contexts/chat-context";
import type { Link } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";
import {
	CheckIcon,
	LinkIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, Card } from "@databuddy/ui";

interface LinkPreviewData {
	expiredRedirectUrl?: string | null;
	expiresAt?: string | null;
	name: string;
	ogDescription?: string | null;
	ogImageUrl?: string | null;
	ogTitle?: string | null;
	slug?: string;
	targetUrl: string;
}

export interface LinkPreviewProps extends BaseComponentProps {
	link: LinkPreviewData;
	mode: "create" | "update" | "delete";
}

interface ModeConfig {
	accent: string;
	ButtonIcon: Icon;
	confirmLabel: string;
	confirmMessage: string;
	title: string;
	tone?: "destructive";
}

const MODE_CONFIG: Record<string, ModeConfig> = {
	create: {
		title: "Create Link",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Link",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Link",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		tone: "destructive",
		ButtonIcon: TrashIcon,
	},
};

export function LinkPreviewRenderer({
	mode,
	link,
	className,
}: LinkPreviewProps) {
	const { sendMessage, status } = useChat();
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);

	const config = MODE_CONFIG[mode];
	const isLoading = status === "streaming" || status === "submitted";
	const hasOgData = link.ogTitle ?? link.ogDescription ?? link.ogImageUrl;
	const hasExpiration = link.expiresAt && link.expiresAt !== "Never";

	const linkForSheet: Partial<Link> = {
		name: link.name,
		targetUrl: link.targetUrl,
		slug: link.slug === "(auto-generated)" ? "" : (link.slug ?? ""),
		expiresAt: undefined,
		expiredRedirectUrl: link.expiredRedirectUrl ?? null,
		ogTitle: link.ogTitle ?? null,
		ogDescription: link.ogDescription ?? null,
		ogImageUrl: link.ogImageUrl ?? null,
	};

	const handleConfirm = () => {
		setIsConfirming(true);
		sendMessage({ text: config.confirmMessage });
		setTimeout(() => setIsConfirming(false), 500);
	};

	return (
		<>
			<Card
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					config.accent,
					className
				)}
			>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
						<div className="flex size-6 items-center justify-center rounded bg-accent">
							<LinkIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<p className="font-medium text-sm">{config.title}</p>
						<Badge className="ml-auto rounded text-[10px]" variant="muted">
							{link.slug === "(auto-generated)" ? "Auto slug" : "Custom slug"}
						</Badge>
					</div>

					<div className="rounded-md bg-background px-3 py-3">
						<div className="space-y-2">
							<div>
								<p className="text-muted-foreground text-xs">Name</p>
								<p className="text-sm">{link.name}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Target URL</p>
								<pre className="mt-1 overflow-x-auto text-pretty break-all rounded  bg-muted p-1.5 px-2 font-mono text-xs">
									<code className="text-ring font-semibold">{link.targetUrl}</code>
								</pre>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Short URL</p>
								<pre className="mt-1 overflow-x-auto rounded  border-border bg-muted p-1.5 px-2 font-mono text-ring text-xs">
									<code className="text-ring font-semibold">
										{link.slug === "(auto-generated)"
											? "Will be auto-generated"
											: `dby.sh/${link.slug}`}
									</code>
								</pre>
							</div>
							<div className="flex gap-2 mt-3">
							{hasExpiration && (
								<div className="w-full max-w-1/2 bg-muted/30 rounded-md px-2 py-1.5">
									<p className="text-muted-foreground text-xs">Expires</p>
									<p className="text-sm mt-0.5">{link.expiresAt ?? "Never"}</p>
								</div>
							)}
							{hasOgData && (
								<div className={cn(hasExpiration ? "" : "", "w-full max-w-1/2 bg-muted/30 rounded-md px-2 py-1.5")}>
									<p className="text-muted-foreground text-xs">
										Social Preview
									</p>
									<p className="text-sm mt-0.5">
										{link.ogTitle ?? "Custom OG data set"}
									</p>
								</div>
							)}
							</div>
						</div>
					</div>

					<div className="rounded-md bg-background">
						<div className="flex items-center justify-end gap-2 bg-muted/30 px-2 py-2">
							<Button
								disabled={isLoading || isConfirming}
								onClick={() => setIsSheetOpen(true)}
								size="sm"
								variant="ghost"
							>
								<PencilSimpleIcon className="size-3.5" />
								Edit
							</Button>
							<Button
								disabled={isLoading}
								loading={isConfirming}
								onClick={handleConfirm}
								size="sm"
								tone={config.tone}
							>
								<config.ButtonIcon className="size-3.5" weight="bold" />
								{config.confirmLabel}
							</Button>
						</div>
					</div>
				</div>
			</Card>

			<LinkSheet
				link={linkForSheet as Link}
				onOpenChange={setIsSheetOpen}
				open={isSheetOpen}
			/>
		</>
	);
}
