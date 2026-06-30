"use client";

import {
	formatMaskedApiKey,
	type ApiKeyListItem,
} from "@/components/organizations/api-key-types";
import { cn } from "@/lib/utils";
import { CaretRightIcon, LockSimpleIcon } from "@databuddy/ui/icons";
import { Badge, Text, dayjs } from "@databuddy/ui";

interface ApiKeyRowProps {
	apiKey: ApiKeyListItem;
	onSelect: () => void;
}

type Status = "active" | "disabled" | "expired" | "revoked";

function resolveStatus(k: ApiKeyListItem): Status {
	if (k.revokedAt) {
		return "revoked";
	}
	if (k.expiresAt && dayjs(k.expiresAt).isBefore(dayjs())) {
		return "expired";
	}
	if (!k.enabled) {
		return "disabled";
	}
	return "active";
}

const STATUS_ICON_STYLE: Record<Status, { container: string; icon: string }> = {
	active: {
		container: "bg-emerald-500/10",
		icon: "text-emerald-500",
	},
	disabled: {
		container: "bg-muted",
		icon: "text-muted-foreground",
	},
	expired: {
		container: "bg-warning/10",
		icon: "text-warning",
	},
	revoked: {
		container: "bg-destructive/10",
		icon: "text-destructive",
	},
};

const STATUS_BADGE: Record<
	Status,
	null | { label: string; variant: "warning" | "destructive" | "muted" }
> = {
	active: null,
	disabled: { label: "Disabled", variant: "muted" },
	expired: { label: "Expired", variant: "warning" },
	revoked: { label: "Revoked", variant: "destructive" },
};

export function ApiKeyRow({ apiKey, onSelect }: ApiKeyRowProps) {
	const status = resolveStatus(apiKey);
	const badge = STATUS_BADGE[status];
	const scopeCount = apiKey.scopes?.length ?? 0;
	const maskedKey = formatMaskedApiKey(apiKey);

	const lastUsedLabel = apiKey.lastUsedAt
		? `Used ${dayjs(apiKey.lastUsedAt).fromNow()}`
		: "Never used";
	const lastUsedTone = apiKey.lastUsedAt
		? dayjs().diff(dayjs(apiKey.lastUsedAt), "day") > 90
			? "warning"
			: "default"
		: "muted";

	const expiresLabel =
		status !== "expired" && apiKey.expiresAt
			? `Expires ${dayjs(apiKey.expiresAt).fromNow()}`
			: null;

	return (
		<button
			aria-label={`Open details for ${apiKey.name}`}
			className={cn(
				"group flex w-full items-center gap-3 px-5 py-3 text-left",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				"hover:bg-interactive-hover"
			)}
			onClick={onSelect}
			type="button"
		>
			<div
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded",
					STATUS_ICON_STYLE[status].container
				)}
			>
				<LockSimpleIcon
					className={cn("size-4", STATUS_ICON_STYLE[status].icon)}
				/>
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<Text
						className={cn(
							"truncate",
							status !== "active" &&
								"text-muted-foreground line-through decoration-muted-foreground/40"
						)}
						variant="label"
					>
						{apiKey.name}
					</Text>
					{badge && (
						<Badge size="sm" variant={badge.variant}>
							{badge.label}
						</Badge>
					)}
					{apiKey.type !== "user" && (
						<Badge size="sm" variant="muted">
							{apiKey.type}
						</Badge>
					)}
					{apiKey.tags?.slice(0, 3).map((tag) => (
						<Badge key={tag} size="sm" variant="muted">
							{tag}
						</Badge>
					))}
					{apiKey.tags && apiKey.tags.length > 3 && (
						<Text tone="muted" variant="caption">
							+{apiKey.tags.length - 3}
						</Text>
					)}
				</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<Text as="span" className="font-mono" tone="muted" variant="caption">
						{maskedKey}
					</Text>
					<Text
						as="span"
						className={cn(
							lastUsedTone === "warning" && "text-warning",
							lastUsedTone === "muted" && "italic"
						)}
						tone={lastUsedTone === "default" ? "muted" : undefined}
						variant="caption"
					>
						{lastUsedLabel}
					</Text>
				</div>
			</div>

			<div className="flex items-center gap-3">
				{scopeCount > 0 && (
					<Badge size="sm" variant="muted">
						{scopeCount} {scopeCount === 1 ? "scope" : "scopes"}
					</Badge>
				)}
				{expiresLabel && (
					<Text
						as="span"
						className="hidden sm:block"
						tone="muted"
						variant="caption"
					>
						{expiresLabel}
					</Text>
				)}
			</div>

			<CaretRightIcon
				className={cn(
					"shrink-0 text-muted-foreground/30 transition-all",
					"group-hover:translate-x-0.5 group-hover:text-muted-foreground"
				)}
				size={12}
				weight="bold"
			/>
		</button>
	);
}
