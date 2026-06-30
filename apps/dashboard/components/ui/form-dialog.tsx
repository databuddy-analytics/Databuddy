"use client";

import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

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

	const drawerHeaderContent = icon ? (
		<div className="flex items-center gap-2">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
				{icon}
			</div>
			<div>
				<DrawerTitle>{title}</DrawerTitle>
				{description && (
					<DrawerDescription>{description}</DrawerDescription>
				)}
			</div>
		</div>
	) : null;

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
				variant="secondary"
			>
				{cancelLabel}
			</Button>
			<Button
				className="flex-1"
				disabled={submitDisabled}
				loading={isSubmitting}
				onClick={onSubmit}
			>
				{submitLabel}
			</Button>
		</>
	);

	if (isMobile) {
		return (
			<Drawer onOpenChange={onOpenChange} open={open}>
				<DrawerContent>
					{icon ? (
						<DrawerHeader>{drawerHeaderContent}</DrawerHeader>
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
			<Dialog.Content className={sizeClasses[size]}>
				<Dialog.Header>
					{icon ? (
						<div className="flex items-center gap-2">
							<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
								{icon}
							</div>
							<div>
								<Dialog.Title>{title}</Dialog.Title>
								{description && (
									<Dialog.Description>{description}</Dialog.Description>
								)}
							</div>
						</div>
					) : (
						<>
							<Dialog.Title>{title}</Dialog.Title>
							{description && (
								<Dialog.Description>{description}</Dialog.Description>
							)}
						</>
					)}
				</Dialog.Header>
				<Dialog.Body>{formContent}</Dialog.Body>
				<Dialog.Footer className="gap-2">{footerContent}</Dialog.Footer>
				<Dialog.Close />
			</Dialog.Content>
		</Dialog>
	);
}
