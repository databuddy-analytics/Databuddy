"use client";

import { CaretDownIcon, GearIcon } from"@phosphor-icons/react";
import { AnimatePresence, motion } from"motion/react";
import { useState } from"react";
import { cn } from"@/lib/utils";

interface AdvancedOptionsProps {
	children: React.ReactNode;
	defaultOpen?: boolean;
}

export function AdvancedOptions({
	children,
	defaultOpen = false,
}: AdvancedOptionsProps) {
	const [isExpanded, setIsExpanded] = useState(defaultOpen);

	return (
		<div className="flex flex-col">
			<button
				className="group flex w-full cursor-pointer items-center justify-between p-3 text-left transition-colors hover:bg-accent/50"
				onClick={() => setIsExpanded(!isExpanded)}
				type="button"
			>
				<div className="flex items-center gap-2.5">
					<GearIcon size={16} weight="duotone" />
					<span className="font-medium text-sm">Advanced Options</span>
				</div>
				<CaretDownIcon
					className={cn(
						"size-4 text-muted-foreground transition-transform duration-200",
						isExpanded &&"rotate-180"
					)}
					weight="fill"
				/>
			</button>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height:"auto", opacity: 1 }}
						className="overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease:"easeInOut" }}
					>
						<div className="space-y-6 px-3 pt-2 pb-4">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
