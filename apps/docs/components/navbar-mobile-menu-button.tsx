"use client";

import { ListIcon, XMarkIcon as XIcon } from "@databuddy/ui/icons";
import { docsNavIconButton } from "@/components/docs-nav-styles";
import { cn } from "@/lib/utils";

interface NavbarMobileMenuButtonProps {
	className?: string;
	isOpen: boolean;
	onToggleAction: () => void;
}

export function NavbarMobileMenuButton({
	className,
	isOpen,
	onToggleAction,
}: NavbarMobileMenuButtonProps) {
	return (
		<button
			aria-label="Toggle mobile menu"
			className={cn(docsNavIconButton, className)}
			onClick={onToggleAction}
			type="button"
		>
			{isOpen ? (
				<XIcon className="size-4" weight="bold" />
			) : (
				<ListIcon className="size-4" weight="bold" />
			)}
		</button>
	);
}
