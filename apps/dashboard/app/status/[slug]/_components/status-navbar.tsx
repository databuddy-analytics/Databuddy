import { LifebuoyIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface StatusNavbarProps {
	logoUrl?: string | null;
	name?: string;
	supportUrl?: string | null;
	websiteUrl?: string | null;
}

export function StatusNavbar({
	name,
	logoUrl,
	websiteUrl,
	supportUrl,
}: StatusNavbarProps) {
	const displayName = name ?? "System Status";

	const brandContent = (
		<span className="flex items-center gap-2">
			{logoUrl ? (
				<Image
					alt=""
					className="shrink-0 rounded object-contain"
					height={20}
					src={logoUrl}
					unoptimized
					width={20}
				/>
			) : null}
			<span className="font-medium text-foreground text-sm tracking-tight">
				{displayName}
			</span>
		</span>
	);

	return (
		<div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
			<nav className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4 sm:px-6">
				{websiteUrl ? (
					<a
						className="transition-opacity hover:opacity-80"
						href={websiteUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{brandContent}
					</a>
				) : (
					brandContent
				)}

				<div className="flex items-center gap-1">
					{supportUrl ? (
						<a
							className="flex items-center gap-1.5 rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
							href={supportUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<LifebuoyIcon className="size-3.5" weight="duotone" />
							<span className="hidden sm:inline">Get Support</span>
						</a>
					) : null}
					<ThemeToggle className="flex" />
				</div>
			</nav>
		</div>
	);
}
