"use client";

import {
	CheckCircleIcon,
	CircleIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DependencySelectorProps, Flag } from "./types";

export function DependencySelector({
	value = [],
	onChange,
	availableFlags = [],
	currentFlagKey,
}: DependencySelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");

	const selectableFlags = availableFlags.filter(
		(flag) => flag.key !== currentFlagKey && !value.includes(flag.key)
	);

	const filteredFlags = selectableFlags.filter(
		(flag) =>
			flag.name?.toLowerCase().includes(search.toLowerCase()) ||
			flag.key.toLowerCase().includes(search.toLowerCase())
	);

	const selectedFlags = value
		.map((key) => availableFlags.find((f) => f.key === key))
		.filter(Boolean) as Flag[];

	const handleSelect = (flagKey: string) => {
		onChange([...value, flagKey]);
		setSearch("");
	};

	const handleRemove = (flagKey: string) => {
		onChange(value.filter((k) => k !== flagKey));
	};

	if (selectableFlags.length === 0 && value.length === 0) {
		return (
			<p className="py-4 text-center text-muted-foreground text-sm">
				No other flags available
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{/* Selected */}
			{selectedFlags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					<AnimatePresence mode="popLayout">
						{selectedFlags.map((flag) => {
							const isActive = flag.status === "active";
							return (
								<motion.div
									animate={{ opacity: 1, scale: 1 }}
									className="group flex items-center gap-1.5 rounded bg-secondary px-2 py-1"
									exit={{ opacity: 0, scale: 0.9 }}
									initial={{ opacity: 0, scale: 0.9 }}
									key={flag.key}
									layout
								>
									<div
										className={cn(
											"size-1.5 rounded-full",
											isActive ? "bg-green-500" : "bg-amber-500"
										)}
									/>
									<span className="text-sm">{flag.name || flag.key}</span>
									<button
										aria-label={`Remove ${flag.name || flag.key}`}
										className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
										onClick={() => handleRemove(flag.key)}
										type="button"
									>
										<XIcon size={12} />
									</button>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			)}

			{/* Add */}
			{selectableFlags.length > 0 && (
				<Popover onOpenChange={setIsOpen} open={isOpen}>
					<PopoverTrigger asChild>
						<Button
							className="h-8 gap-1.5 text-muted-foreground"
							size="sm"
							type="button"
							variant="ghost"
						>
							<PlusIcon size={14} />
							Add dependency
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-64 p-2">
						<Input
							className="mb-2 h-8"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search…"
							value={search}
						/>
						<div
							className="max-h-40 space-y-0.5 overflow-y-auto"
							// Fixes Radix UI Popover content scrolling issue: https://github.com/radix-ui/primitives/issues/1159
							onTouchMove={(e) => e.stopPropagation()}
							onWheel={(e) => e.stopPropagation()}
						>
							{filteredFlags.length > 0 ? (
								filteredFlags.map((flag) => {
									const isActive = flag.status === "active";
									return (
										<button
											className="flex w-full items-center gap-2 rounded p-2 text-left text-sm transition-colors hover:bg-accent"
											key={flag.key}
											onClick={() => {
												handleSelect(flag.key);
												setIsOpen(false);
											}}
											type="button"
										>
											{isActive ? (
												<CheckCircleIcon
													className="shrink-0 text-green-500"
													size={14}
													weight="fill"
												/>
											) : (
												<CircleIcon
													className="shrink-0 text-amber-500"
													size={14}
												/>
											)}
											<span className="truncate">{flag.name || flag.key}</span>
										</button>
									);
								})
							) : (
								<p className="py-2 text-center text-muted-foreground text-xs">
									No flags found
								</p>
							)}
						</div>
					</PopoverContent>
				</Popover>
			)}

			{value.length > 0 && (
				<p className="text-muted-foreground text-xs">
					This flag requires all dependencies to be active
				</p>
			)}
		</div>
	);
}
