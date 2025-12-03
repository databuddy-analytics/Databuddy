import { CircleNotchIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsSectionProps = {
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
};

export function SettingsSection({
	title,
	description,
	children,
	className,
}: SettingsSectionProps) {
	return (
		<section className={cn("border-b px-5 py-6", className)}>
			<div className="mb-4">
				<h3 className="font-semibold text-sm">{title}</h3>
				{description && (
					<p className="text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			{children}
		</section>
	);
}

type SettingsRowProps = {
	label: React.ReactNode;
	description?: string;
	children: React.ReactNode;
	className?: string;
};

export function SettingsRow({
	label,
	description,
	children,
	className,
}: SettingsRowProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
				className
			)}
		>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-sm">{label}</p>
				{description && (
					<p className="text-muted-foreground text-xs">{description}</p>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

type ComingSoonProps = {
	title: string;
	description: string;
	icon: React.ReactNode;
};

export function ComingSoon({ title, description, icon }: ComingSoonProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
			<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-accent">
				{icon}
			</div>
			<h2 className="font-semibold text-lg">{title}</h2>
			<p className="mt-1 max-w-sm text-muted-foreground text-sm">
				{description}
			</p>
		</div>
	);
}

type UnsavedChangesFooterProps = {
	hasChanges: boolean;
	isSaving: boolean;
	onSave: () => void;
	onDiscard?: () => void;
	saveLabel?: string;
	message?: string;
};

export function UnsavedChangesFooter({
	hasChanges,
	isSaving,
	onSave,
	onDiscard,
	saveLabel = "Save Changes",
	message = "You have unsaved changes",
}: UnsavedChangesFooterProps) {
	useHotkeys(
		"escape",
		() => {
			if (hasChanges && !isSaving && onDiscard) {
				onDiscard();
			}
		},
		{ enabled: hasChanges && !isSaving && Boolean(onDiscard) },
		[hasChanges, isSaving, onDiscard]
	);

	if (!(hasChanges || isSaving)) {
		return null;
	}

	return (
		<section className="angled-rectangle-gradient sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-3 border-t bg-secondary px-5 py-4">
			<p className="text-muted-foreground text-sm">{message}</p>
			<div className="flex items-center gap-2">
				{onDiscard && (
					<Button
						disabled={isSaving}
						onClick={onDiscard}
						size="sm"
						variant="ghost"
					>
						Discard
					</Button>
				)}
				<Button disabled={isSaving} onClick={onSave} size="sm">
					{isSaving && <CircleNotchIcon className="mr-2 size-4 animate-spin" />}
					{saveLabel}
				</Button>
			</div>
		</section>
	);
}
