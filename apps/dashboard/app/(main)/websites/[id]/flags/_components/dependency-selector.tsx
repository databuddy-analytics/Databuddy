"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { DependencySelectorProps, Flag } from "./types";
import {
	CheckCircleIcon,
	CircleIcon,
	GitBranchIcon,
	PlusIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Button, Input } from "@databuddy/ui";
import { Popover } from "@databuddy/ui/client";

const EMPTY_VALUES: string[] = [];
const EMPTY_FLAGS: Flag[] = [];

export function DependencySelector({
	value = EMPTY_VALUES,
	onChange,
	availableFlags = EMPTY_FLAGS,
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
			<div className="rounded-lg border border-dashed bg-accent/50 p-4 text-center">
				<GitBranchIcon
					className="mx-auto mb-2 size-6 text-muted-foreground"
					weight="duotone"
				/>
				<p className="text-balance text-muted-foreground text-xs">
					No other flags available to set as dependencies.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{selectedFlags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					<AnimatePresence mode="popLayout">
						{selectedFlags.map((flag) => {
							const isActive = flag.status === "active";
							return (
								<motion.div
									animate={{ opacity: 1, scale: 1 }}
									className={cn(
										"group inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-foreground text-xs shadow-sm",
										isActive ? "border-success/40" : "border-warning/40"
									)}
									exit={{ opacity: 0, scale: 0.9 }}
									initial={{ opacity: 0, scale: 0.9 }}
									key={flag.key}
									layout
								>
									<div
										className={cn(
											"size-1.5 rounded-full",
											isActive ? "bg-success" : "bg-warning"
										)}
									/>
									<span className="max-w-28 truncate font-medium">
										{flag.name || flag.key}
									</span>
									<button
										aria-label={`Remove ${flag.name || flag.key}`}
										className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
										onClick={() => handleRemove(flag.key)}
										type="button"
									>
										<XIcon className="size-3" weight="bold" />
									</button>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			)}

			{selectableFlags.length > 0 && (
				<Popover onOpenChange={setIsOpen} open={isOpen}>
					<Popover.Trigger
						render={
							<Button
								className="w-full text-muted-foreground"
								size="sm"
								type="button"
								variant="secondary"
							/>
						}
					>
						<PlusIcon className="size-3.5" />
						{value.length > 0 ? "Add more dependencies" : "Add dependency"}
					</Popover.Trigger>
					<Popover.Content className="w-72 p-2" side="bottom">
						<div className="mb-2 px-2 pt-1">
							<Popover.Title>Dependencies</Popover.Title>
							<Popover.Description>
								Flags that must be active for this flag to evaluate
							</Popover.Description>
						</div>
						<div className="mb-2 px-0.5">
							<Input
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search flags…"
								value={search}
							/>
						</div>
						<div
							className="max-h-64 space-y-0.5 overflow-y-auto"
							onTouchMove={(e) => e.stopPropagation()}
							onWheel={(e) => e.stopPropagation()}
						>
							{filteredFlags.length > 0 ? (
								filteredFlags.map((flag) => {
									const isActive = flag.status === "active";
									return (
										<button
											className="flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left text-foreground text-xs transition-colors hover:bg-interactive-hover"
											key={flag.key}
											onClick={() => {
												handleSelect(flag.key);
												setIsOpen(false);
											}}
											type="button"
										>
											{isActive ? (
												<CheckCircleIcon
													className="shrink-0 text-success"
													size={14}
													weight="fill"
												/>
											) : (
												<CircleIcon
													className="shrink-0 text-warning"
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
					</Popover.Content>
				</Popover>
			)}
		</div>
	);
}
