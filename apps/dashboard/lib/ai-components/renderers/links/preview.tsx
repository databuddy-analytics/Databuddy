"use client";

import type { Icon } from "@phosphor-icons/react";
import {
	CalendarIcon,
	CheckIcon,
	CircleNotchIcon,
	ImageIcon,
	LinkIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { LinkSheet } from "@/app/(main)/links/_components/link-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useChat } from "@/contexts/chat-context";
import type { Link } from "@/hooks/use-links";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../../types";

interface LinkPreviewData {
	name: string;
	targetUrl: string;
	slug?: string;
	expiresAt?: string | null;
	expiredRedirectUrl?: string | null;
	ogTitle?: string | null;
	ogDescription?: string | null;
	ogImageUrl?: string | null;
}

export interface LinkPreviewProps extends BaseComponentProps {
	mode: "create" | "update" | "delete";
	link: LinkPreviewData;
}

interface ModeConfig {
	title: string;
	confirmLabel: string;
	confirmMessage: string;
	accent: string;
	variant: "default" | "destructive";
	ButtonIcon: Icon;
}

const MODE_CONFIG: Record<string, ModeConfig> = {
	create: {
		title: "Create Link",
		confirmLabel: "Create",
		confirmMessage: "Yes, create it",
		accent: "",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	update: {
		title: "Update Link",
		confirmLabel: "Update",
		confirmMessage: "Yes, update it",
		accent: "border-amber-500/30",
		variant: "default",
		ButtonIcon: CheckIcon,
	},
	delete: {
		title: "Delete Link",
		confirmLabel: "Delete",
		confirmMessage: "Yes, delete it",
		accent: "border-destructive/30",
		variant: "destructive",
		ButtonIcon: TrashIcon,
	},
};

function Row({
	label,
	value,
	icon: IconComponent,
}: {
	label: string;
	value: string;
	icon?: Icon;
}) {
	return (
		<div className="flex items-start gap-2.5 py-2">
			{IconComponent && (
				<IconComponent
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					weight="duotone"
				/>
			)}
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p className="truncate text-sm">{value}</p>
			</div>
		</div>
	);
}

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
					"gap-0 overflow-hidden border py-0",
					config.accent,
					className
				)}
			>
				<div className="flex items-center gap-2.5 border-b px-3 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<LinkIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="font-medium text-sm">{config.title}</p>
				</div>

				<div className="divide-y px-3">
					<Row label="Name" value={link.name} />
					<Row label="Target URL" value={link.targetUrl} />
					<Row
						label="Short URL"
						value={
							link.slug === "(auto-generated)"
								? "Will be auto-generated"
								: `dby.sh/${link.slug}`
						}
					/>
					{hasExpiration && (
						<Row
							icon={CalendarIcon}
							label="Expires"
							value={link.expiresAt ?? "Never"}
						/>
					)}
					{hasOgData && (
						<Row
							icon={ImageIcon}
							label="Social Preview"
							value={link.ogTitle ?? "Custom OG data set"}
						/>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-3 py-2">
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
						disabled={isLoading || isConfirming}
						onClick={handleConfirm}
						size="sm"
						variant={config.variant}
					>
						{isConfirming ? (
							<CircleNotchIcon className="size-3.5 animate-spin" />
						) : (
							<config.ButtonIcon className="size-3.5" weight="bold" />
						)}
						{config.confirmLabel}
					</Button>
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
