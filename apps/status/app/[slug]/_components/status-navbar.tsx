import { Avatar, ThemeToggle } from "@databuddy/ui/client";
import { LifebuoyIcon } from "@databuddy/ui/icons";

interface StatusNavbarProps {
	logoUrl?: string | null;
	name: string;
	supportUrl?: string | null;
	websiteUrl?: string | null;
}

export function StatusNavbar({
	logoUrl,
	name,
	websiteUrl,
	supportUrl,
}: StatusNavbarProps) {
	const logo = logoUrl ? (
		<Avatar alt="" className="rounded" size="sm" src={logoUrl} />
	) : null;
	const brand = (
		<span className="flex min-w-0 items-center gap-2">
			{logo}
			<span className="truncate font-medium text-[13px] text-foreground">
				{name}
			</span>
		</span>
	);

	return (
		<div className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg">
			<nav className="mx-auto flex h-14 max-w-[822px] items-center justify-between px-4 sm:px-6">
				{websiteUrl ? (
					<a
						className="min-w-0 transition-opacity hover:opacity-70"
						href={websiteUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{brand}
					</a>
				) : (
					brand
				)}

				<div className="flex items-center gap-1.5">
					{supportUrl ? (
						<a
							className="flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2.5 text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-foreground"
							href={supportUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<LifebuoyIcon className="size-3.5" />
							<span className="hidden sm:inline">Support</span>
						</a>
					) : null}
					<ThemeToggle className="flex" />
				</div>
			</nav>
			<div className="mx-auto max-w-[822px] px-4 sm:px-6">
				<div className="h-px rounded-full bg-border" />
			</div>
		</div>
	);
}
