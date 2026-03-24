"use client";

import { ListIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type NavbarMobileMenuButtonProps = {
	isOpen: boolean;
	onToggleAction: () => void;
};

const iconBase = "absolute inset-0 size-6 transition-all duration-300 ease-out";

export function NavbarMobileMenuButton({
	isOpen,
	onToggleAction,
}: NavbarMobileMenuButtonProps) {
	return (
		<button
			aria-label="Toggle mobile menu"
			className="group relative rounded border border-transparent p-2.5 transition-all duration-200 hover:border-border/30 hover:bg-muted/50 active:bg-muted/70 md:hidden"
			onClick={onToggleAction}
			type="button"
		>
			<div className="relative size-6">
				<ListIcon
					className={cn(
						iconBase,
						isOpen
							? "rotate-90 scale-90 opacity-0"
							: "rotate-0 scale-100 opacity-100"
					)}
					weight="duotone"
				/>
				<XIcon
					className={cn(
						iconBase,
						isOpen
							? "rotate-0 scale-100 opacity-100"
							: "-rotate-90 scale-90 opacity-0"
					)}
				/>
			</div>
		</button>
	);
}
