import {
	BookOpenIcon,
	ChatCircleIcon,
	KeyboardIcon,
	PlayIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";

type HelpDialogProps = {
	open: boolean;
	onOpenChangeAction: (open: boolean) => void;
};

const helpItems = [
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

export function HelpDialog({ open, onOpenChangeAction }: HelpDialogProps) {
	const [showShortcuts, setShowShortcuts] = useState(false);

	return (
		<Dialog onOpenChange={onOpenChangeAction} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader className="text-center">
					<DialogTitle>Help & Resources</DialogTitle>
					<DialogDescription>
						Get assistance and learn more about Databuddy
					</DialogDescription>
				</DialogHeader>

				{showShortcuts ? (
					<div className="max-h-[60vh] overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-semibold text-sm">Keyboard Shortcuts</h3>
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
					<div className="space-y-2">
						<Button
							className="h-auto w-full justify-start p-4 text-left hover:bg-accent"
							onClick={() => setShowShortcuts(true)}
							variant="ghost"
						>
							<div className="flex items-start gap-4">
								<div className="rounded-lg bg-accent-brighter p-2">
									<KeyboardIcon
										className="size-5 text-accent-foreground"
										weight="duotone"
									/>
								</div>
								<div className="min-w-0 flex-1">
									<h4 className="font-semibold text-sm leading-none">
										Keyboard Shortcuts
									</h4>
									<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
										View all available keyboard shortcuts
									</p>
								</div>
							</div>
						</Button>

						{helpItems.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									href={item.href}
									key={item.href}
									{...(item.external && {
										target: "_blank",
										rel: "noopener noreferrer",
									})}
									className="block"
								>
									<Button
										className="h-auto w-full justify-start p-4 text-left hover:bg-accent"
										variant="ghost"
									>
										<div className="flex items-start gap-4">
											<div className="rounded-lg bg-accent-brighter p-2">
												<Icon
													className="size-5 text-accent-foreground"
													weight="duotone"
												/>
											</div>
											<div className="min-w-0 flex-1">
												<h4 className="font-semibold text-sm leading-none">
													{item.title}
												</h4>
												<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
													{item.description}
												</p>
											</div>
										</div>
									</Button>
								</Link>
							);
						})}
					</div>
				)}

				<DialogFooter>
					<Button
						className="w-full"
						onClick={() => {
							setShowShortcuts(false);
							onOpenChangeAction(false);
						}}
						type="button"
						variant="secondary"
					>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
