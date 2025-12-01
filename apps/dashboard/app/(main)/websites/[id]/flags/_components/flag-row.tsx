"use client";

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { orpc } from "@/lib/orpc";
import { FlagActions } from "./flag-actions";
import type { Flag } from "./types";

type FlagRowProps = {
	flag: Flag;
	onEditAction: () => void;
	isExpanded?: boolean;
	onToggleAction?: (flagId: string) => void;
	children?: React.ReactNode;
};

export function FlagRow({
	flag,
	onEditAction,
	isExpanded = false,
	onToggleAction,
	children,
}: FlagRowProps) {
	const queryClient = useQueryClient();

	const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement;
		if (target.closest("button")) {
			return;
		}
		if (onToggleAction) {
			onToggleAction(flag.id);
		}
	};

	const getStatusBadge = (status: string) => {
		if (status === "active") {
			return (
				<Badge variant="green">
					<span className="h-1.5 w-1.5 rounded bg-green-500" />
					Active
				</Badge>
			);
		}
		if (status === "inactive") {
			return (
				<Badge variant="secondary">
					<span className="h-1.5 w-1.5 rounded bg-zinc-400" />
					Inactive
				</Badge>
			);
		}
		if (status === "archived") {
			return (
				<Badge variant="amber">
					<span className="h-1.5 w-1.5 rounded bg-amber-500" />
					Archived
				</Badge>
			);
		}
		return <Badge>{status}</Badge>;
	};

	const ruleCount = Array.isArray(flag.rules) ? flag.rules.length : 0;
	const rollout =
		typeof flag.rolloutPercentage === "number" ? flag.rolloutPercentage : 0;
	const isBooleanFlag = String(flag.type).toLowerCase() === "boolean";
	const defaultLabel =
		isBooleanFlag && typeof flag.defaultValue === "boolean"
			? `Default: ${flag.defaultValue ? "On" : "Off"}`
			: undefined;

	return (
		<Card
			className="mb-4 cursor-pointer select-none overflow-hidden rounded py-0 transition focus-visible:ring-(--color-primary) focus-visible:ring-2"
			onClick={handleCardClick}
			onKeyDown={(e) => {
				if ((e.key === "Enter" || e.key === " ") && onToggleAction) {
					onToggleAction(flag.id);
				}
			}}
			style={{ outline: "none" }}
			tabIndex={0}
		>
			<div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
				<div className="flex grow flex-col text-left">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<h3
							className="mr-2 truncate font-mono font-semibold text-base"
							style={{ color: "var(--color-foreground)" }}
						>
							{flag.key}
						</h3>
						{rollout > 0 && (
							<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
								<span className="h-1.5 w-1.5 rounded bg-primary" />
								{rollout}% rollout
							</span>
						)}
						{ruleCount > 0 && (
							<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
								{ruleCount} rule{ruleCount !== 1 ? "s" : ""}
							</span>
						)}
					</div>
					{flag.name && (
						<p className="mt-2 mb-1 font-medium text-foreground text-sm">
							{flag.name}
						</p>
					)}
					{flag.description && (
						<p className="line-clamp-2 text-muted-foreground text-sm">
							{flag.description}
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					{getStatusBadge(flag.status)}
					{defaultLabel && (
						<span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-muted-foreground text-xs">
							{defaultLabel}
						</span>
					)}
					<FlagActions
						flag={flag}
						onDeletedAction={() => {
							queryClient.invalidateQueries({
								queryKey: orpc.flags.list.key({
									input: { websiteId: flag.websiteId ?? "" },
								}),
							});
						}}
						onEditAction={onEditAction}
					/>
					{onToggleAction && (
						<Button
							className="focus-visible:ring-(--color-primary) focus-visible:ring-2"
							onClick={(e) => {
								e.stopPropagation();
								onToggleAction(flag.id);
							}}
							size="icon"
							type="button"
							variant="ghost"
						>
							{isExpanded ? (
								<CaretUpIcon className="h-4 w-4" weight="fill" />
							) : (
								<CaretDownIcon className="h-4 w-4" weight="fill" />
							)}
						</Button>
					)}
				</div>
			</div>
			{isExpanded && (
				<div className="border-border border-t bg-muted/30">
					<div className="p-4">{children}</div>
				</div>
			)}
		</Card>
	);
}
