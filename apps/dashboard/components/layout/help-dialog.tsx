import { BookOpenIcon, ChatCircleIcon, PlayIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface HelpDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const helpItems = [
	{
		href: 'https://www.databuddy.cc/docs',
		icon: BookOpenIcon,
		title: 'Documentation',
		description: 'Read guides and API references',
		external: true,
	},
	{
		href: 'mailto:support@databuddy.cc',
		icon: ChatCircleIcon,
		title: 'Contact Support',
		description: 'Get help from our support team',
		external: false,
	},
	{
		href: 'https://www.youtube.com/@trydatabuddy',
		icon: PlayIcon,
		title: 'Tutorials',
		description: 'Learn Databuddy step by step',
		external: true,
	},
] as const;

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader className="text-center">
					<DialogTitle>Help & Resources</DialogTitle>
					<DialogDescription>
						Get assistance and learn more about Databuddy
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2 py-4">
					{helpItems.map((item) => {
						const Icon = item.icon;
						return (
							<Link
								href={item.href}
								key={item.href}
								{...(item.external && {
									target: '_blank',
									rel: 'noopener noreferrer',
								})}
								className="block"
							>
								<Button
									className="h-auto w-full justify-start p-4 text-left transition-colors hover:bg-muted/50"
									variant="ghost"
								>
									<div className="flex items-start gap-4">
										<div className="rounded-lg bg-primary/10 p-2">
											<Icon className="h-5 w-5 text-primary" weight="duotone" />
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
			</DialogContent>
		</Dialog>
	);
}
