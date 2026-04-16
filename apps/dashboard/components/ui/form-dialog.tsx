"use client";

import { CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface FormDialogProps {
	cancelLabel?: string;
	children: React.ReactNode;
	description?: string;
	icon?: React.ReactNode;
	isSubmitting?: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: () => void;
	open: boolean;
	size?: "sm" | "md" | "lg";
	submitDisabled?: boolean;
	submitLabel?: string;
	title: string;
}

export function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	onSubmit,
	submitLabel = "Save",
	cancelLabel = "Cancel",
	isSubmitting = false,
	submitDisabled = false,
	icon,
	size = "md",
}: FormDialogProps) {
	const isMobile = useIsMobile();

	const sizeClasses = {
		sm: "w-[95vw] max-w-sm sm:w-full",
		md: "w-[95vw] max-w-md sm:w-full",
		lg: "w-[95vw] max-w-lg sm:w-full",
	};

	const headerContent = (
		<>
			{icon && (
				<div className="flex items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-secondary">
						{icon}
					</div>
					<div className="flex-1">
						<div className="font-semibold text-base text-foreground leading-none">
							{title}
						</div>
						{description && (
							<div className="mt-1.5 text-muted-foreground text-sm">
								{description}
							</div>
						)}
					</div>
				</div>
			)}
			{!icon && (
				<>
					<div className="font-semibold text-foreground">{title}</div>
					{description && (
						<div className="text-muted-foreground text-sm">{description}</div>
					)}
				</>
			)}
		</>
	);

	const formContent = (
		<fieldset className="space-y-4" disabled={isSubmitting}>
			{children}
		</fieldset>
	);

	const footerContent = (
		<>
			<Button
				className="flex-1"
				disabled={isSubmitting}
				onClick={() => onOpenChange(false)}
				type="button"
				variant="outline"
			>
				{cancelLabel}
			</Button>
			<Button
				className="flex-1"
				disabled={isSubmitting || submitDisabled}
				onClick={onSubmit}
				type="submit"
			>
				{isSubmitting && (
					<CircleNotchIcon
						className="mr-2 size-4 animate-spin"
						weight="duotone"
					/>
				)}
				{submitLabel}
			</Button>
		</>
	);

	if (isMobile) {
		return (
			<Drawer onOpenChange={onOpenChange} open={open}>
				<DrawerContent>
					{icon ? (
						<DrawerHeader>{headerContent}</DrawerHeader>
					) : (
						<DrawerHeader>
							<DrawerTitle>{title}</DrawerTitle>
							{description && (
								<DrawerDescription>{description}</DrawerDescription>
							)}
						</DrawerHeader>
					)}
					<div className="overflow-y-auto p-5">{formContent}</div>
					<DrawerFooter className="flex-row gap-2">
						{footerContent}
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className={sizeClasses[size]}>
				{icon ? (
					<div className="mb-4">{headerContent}</div>
				) : (
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
					</DialogHeader>
				)}
				{formContent}
				<DialogFooter className="gap-2">{footerContent}</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
