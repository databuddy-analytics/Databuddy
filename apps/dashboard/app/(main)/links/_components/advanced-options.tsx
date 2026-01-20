"use client";

import { GearIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

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
		<div className="rounded border border-black/5 bg-gray-200/60 p-4 outline-1 -outline-offset-1 outline-black/5">
			<div className={isExpanded ? "mb-4 flex flex-col gap-3" : "flex flex-col gap-3"}>
				<div className="flex h-5 items-center justify-between">
					<div className="font-medium text-sm text-neutral-900">
						Advanced options
					</div>
					<Switch
						checked={isExpanded}
						onCheckedChange={setIsExpanded}
					/>
				</div>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded && (
					<motion.div
						animate={{ height: "auto", opacity: 1 }}
						className="flex flex-col gap-8 overflow-hidden"
						exit={{ height: 0, opacity: 0 }}
						initial={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
					>
						{children}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
