"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
	badge?: number;
	children: React.ReactNode;
	icon: React.ComponentType<{ size?: number; weight?: "duotone" | "fill" }>;
	isExpanded: boolean;
	onToggleAction: () => void;
	title: string;
}

export function CollapsibleSection({
	icon: Icon,
	title,
	badge,
	isExpanded,
	onToggleAction,
	children,
}: CollapsibleSectionProps) {
	return (
		<div className="flex flex-col gap-2">
			<button
				className="group flex w-full cursor-pointer items-center justify-between rounded p-3 text-left transition-colors hover:bg-accent/50"
				onClick={onToggleAction}
				type="button"
			>
				<div className="flex items-center gap-2.5">
					<Icon size={16} weight="duotone" />
					<span className="font-medium text-sm">{title}</span>
					{badge !== undefined && badge > 0 && (
						<span className="flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
							{badge}
						</span>
					)}
				</div>
				<CaretDownIcon
					className={cn(
						"size-4 text-muted-foreground transition-transform duration-200",
						isExpanded && "rotate-180"
					)}
					weight="fill"
				/>
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						<div className="pb-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
