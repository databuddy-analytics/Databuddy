"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCommandSearchOpenAction } from "@/components/ui/command-search";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { authClient } from "@databuddy/auth/client";
import { ListIcon } from "@phosphor-icons/react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { MonitorIcon } from "@phosphor-icons/react";
import { MoonIcon } from "@phosphor-icons/react";
import { SignOutIcon } from "@phosphor-icons/react";
import { SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Branding } from "./logo";
import { NavigationRenderer } from "./navigation/navigation-renderer";
import { useSidebarNavigation } from "./sidebar-navigation-provider";

function MobileThemeToggle() {
	const { theme, setTheme } = useTheme();
	const currentTheme = theme ?? "system";

	const themes = [
		{ id: "light" as const, icon: SunIcon, label: "Light" },
		{ id: "dark" as const, icon: MoonIcon, label: "Dark" },
		{ id: "system" as const, icon: MonitorIcon, label: "System" },
	];

	return (
		<div className="flex gap-0.5 rounded bg-sidebar-accent/40 p-0.5">
			{themes.map(({ id, icon: Icon, label }) => (
				<button
					className={cn(
						"flex h-7 flex-1 items-center justify-center gap-1.5 rounded text-xs transition-colors",
						currentTheme === id
							? "bg-background font-medium text-sidebar-accent-foreground shadow-sm"
							: "text-sidebar-foreground/50 hover:text-sidebar-foreground"
					)}
					key={id}
					onClick={() => setTheme(id)}
					suppressHydrationWarning
					type="button"
				>
					<Icon
						className="size-3.5"
						suppressHydrationWarning
						weight="duotone"
					/>
					<span suppressHydrationWarning>{label}</span>
				</button>
			))}
		</div>
	);
}

const getInitials = (
	name: string | null | undefined,
	email: string | null | undefined
) => {
	if (name) {
		return name
			.split(" ")
			.map((n) => n.at(0))
			.join("")
			.toUpperCase()
			.slice(0, 2);
	}
	return email?.at(0)?.toUpperCase() || "U";
};

export function MobileSidebar() {
	const { data: session } = authClient.useSession();
	const user = session?.user ?? null;

	const { header, categories, activeCategory, setCategory, pathname } =
		useSidebarNavigation();

	const [isOpen, setIsOpen] = useState(false);
	const router = useRouter();
	const openCommandSearchAction = useCommandSearchOpenAction();

	useEffect(() => {
		setIsOpen(false);
	}, [pathname]);

	const handleSignOut = useCallback(async () => {
		setIsOpen(false);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.success("Logged out successfully");
					router.push("/login");
				},
				onError: (error) => {
					router.push("/login");
					toast.error(error.error.message || "Failed to log out");
				},
			},
		});
	}, [router]);

	return (
		<div className="md:hidden">
			<header className="fixed top-0 right-0 left-0 z-40 h-12 w-full border-b bg-background">
				<div className="flex h-full items-center justify-between px-3">
					<div className="flex items-center gap-2.5">
						<Button
							aria-label="Open navigation menu"
							className="size-9"
							data-track="sidebar-toggle"
							onClick={() => setIsOpen(true)}
							size="icon"
							type="button"
							variant="ghost"
						>
							<ListIcon className="size-5" weight="duotone" />
						</Button>

						<Link
							className="flex min-w-0 select-none items-center gap-2 transition-opacity hover:opacity-80"
							data-track="logo-click"
							href="/websites"
						>
							<Branding heightPx={22} priority variant="primary-logo" />
						</Link>
					</div>

					<Button
						aria-label="Search"
						className="size-9"
						data-track="mobile-search"
						onClick={() => openCommandSearchAction()}
						size="icon"
						type="button"
						variant="ghost"
					>
						<MagnifyingGlassIcon className="size-5" weight="duotone" />
					</Button>
				</div>
			</header>

			<Drawer direction="left" onOpenChange={setIsOpen} open={isOpen}>
				<DrawerContent className="bg-sidebar">
					<div className="flex h-12 shrink-0 items-center border-b px-4">
						<Link
							className="flex select-none items-center gap-2 transition-opacity hover:opacity-80"
							href="/websites"
							onClick={() => setIsOpen(false)}
						>
							<Branding heightPx={22} priority variant="primary-logo" />
						</Link>
					</div>

					{header}

					{categories.length > 1 ? (
						<div className="shrink-0 border-b px-3 py-2.5">
							<div className="flex gap-1 overflow-x-auto">
								{categories.map((category) => {
									const Icon = category.icon;
									const isActive = activeCategory === category.id;
									return (
										<button
											className={cn(
												"flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 font-medium text-xs transition-colors",
												isActive
													? "bg-sidebar-accent text-sidebar-accent-foreground"
													: "text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
											)}
											key={category.id}
											onClick={() => setCategory(category.id)}
											type="button"
										>
											<Icon
												className="size-3.5"
												weight={isActive ? "fill" : "duotone"}
											/>
											<span>{category.name}</span>
										</button>
									);
								})}
							</div>
						</div>
					) : null}

					<ScrollArea className="flex-1">
						<NavigationRenderer />
					</ScrollArea>

					<div className="shrink-0 border-t bg-sidebar">
						<div className="border-b px-3 py-2.5">
							<MobileThemeToggle />
						</div>

						{user ? (
							<div className="flex items-center gap-3 px-3 py-3">
								<Avatar className="size-8 shrink-0">
									<AvatarImage
										alt={user.name || "User"}
										src={user.image || undefined}
									/>
									<AvatarFallback className="bg-primary text-primary-foreground text-xs">
										{getInitials(user.name, user.email)}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sidebar-foreground text-sm">
										{user.name || "User"}
									</p>
									<p className="truncate text-sidebar-foreground/50 text-xs">
										{user.email}
									</p>
								</div>
								<Button
									aria-label="Sign out"
									className="size-8 shrink-0 text-sidebar-foreground/50 hover:text-destructive"
									onClick={handleSignOut}
									size="icon"
									type="button"
									variant="ghost"
								>
									<SignOutIcon className="size-4" weight="duotone" />
								</Button>
							</div>
						) : null}
					</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
}
