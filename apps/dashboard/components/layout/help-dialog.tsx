"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";
import { cn } from "@/lib/utils";
import {
	BookOpenIcon,
	ChatTextIcon as ChatCircleIcon,
	CommandIcon as KeyboardIcon,
	PlayIcon,
} from "@databuddy/ui/icons";
import { Button, Text } from "@databuddy/ui";
import { Dialog } from "@databuddy/ui/client";

interface HelpDialogProps {
	onOpenChangeAction: (open: boolean) => void;
	open: boolean;
}

const HELP_ITEMS = [
	{
		href: "https://www.databuddy.cc/docs",
		icon: BookOpenIcon,
		title: "Documentation",
		description: "Read guides and API references",
		external: true,
	},
	{
		href: "mailto:support@databuddy.cc",
		icon: ChatCircleIcon,
		title: "Contact Support",
		description: "Get help from our support team",
		external: false,
	},
	{
		href: "https://www.youtube.com/@trydatabuddy",
		icon: PlayIcon,
		title: "Tutorials",
		description: "Learn Databuddy step by step",
		external: true,
	},
] as const;

function HelpRow({
	children,
	className,
	...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			className={cn(
				"flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				"hover:bg-interactive-hover",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				className
			)}
			type="button"
			{...rest}
		>
			{children}
		</button>
	);
}

export function HelpDialog({ open, onOpenChangeAction }: HelpDialogProps) {
	const [showShortcuts, setShowShortcuts] = useState(false);

	return (
		<Dialog
			onOpenChange={(o) => {
				if (!o) {
					setShowShortcuts(false);
				}
				onOpenChangeAction(o);
			}}
			open={open}
		>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Help & Resources</Dialog.Title>
					<Dialog.Description>
						Get assistance and learn more about Databuddy
					</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body className="p-2">
					{showShortcuts ? (
						<div className="max-h-[60vh] overflow-y-auto">
							<div className="mb-3 flex items-center justify-between px-3">
								<Text variant="label">Keyboard Shortcuts</Text>
								<Button
									onClick={() => setShowShortcuts(false)}
									size="sm"
									variant="ghost"
								>
									Back
								</Button>
							</div>
							<KeyboardShortcuts />
						</div>
					) : (
						<div className="space-y-0.5">
							<HelpRow onClick={() => setShowShortcuts(true)}>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
									<KeyboardIcon
										className="size-4 text-muted-foreground"
										weight="duotone"
									/>
								</div>
								<div className="min-w-0 flex-1">
									<Text variant="label">Keyboard Shortcuts</Text>
									<Text tone="muted" variant="caption">
										View all available keyboard shortcuts
									</Text>
								</div>
							</HelpRow>

							{HELP_ITEMS.map((item) => {
								const Icon = item.icon;
								return (
									<Link
										className={cn(
											"flex items-center gap-3 rounded-md px-3 py-2.5",
											"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
											"hover:bg-interactive-hover",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
										)}
										href={item.href}
										key={item.href}
										{...(item.external && {
											target: "_blank",
											rel: "noopener noreferrer",
										})}
									>
										<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary">
											<Icon
												className="size-4 text-muted-foreground"
												weight="duotone"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<Text variant="label">{item.title}</Text>
											<Text tone="muted" variant="caption">
												{item.description}
											</Text>
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</Dialog.Body>
			</Dialog.Content>
		</Dialog>
	);
}
