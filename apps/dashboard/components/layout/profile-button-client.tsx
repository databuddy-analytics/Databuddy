"use client";

import { authClient } from "@databuddy/auth/client";
import { CaretRightIcon } from "@phosphor-icons/react";
import { CreditCardIcon } from "@phosphor-icons/react";
import { GearIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { SignOutIcon } from "@phosphor-icons/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ProfileButtonUser {
	email?: string | null;
	id?: string;
	image?: string | null;
	name?: string | null;
}

interface ProfileButtonClientProps {
	user: ProfileButtonUser | null;
}

interface DeviceSession {
	session: {
		id: string;
		token: string;
		userId: string;
		expiresAt: Date;
		ipAddress: string | null;
		userAgent: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean;
		image: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
}

const PRESERVED_QUERY_KEYS = [["auth", "session"], ["device-sessions"]];

export function ProfileButtonClient({ user }: ProfileButtonClientProps) {
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [switchingTo, setSwitchingTo] = useState<string | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const router = useRouter();
	const queryClient = useQueryClient();

	const { data: deviceSessions } = useQuery({
		queryKey: ["device-sessions"],
		queryFn: async () => {
			const result = await authClient.multiSession.listDeviceSessions({});
			return result.data as DeviceSession[] | null;
		},
		enabled: isOpen,
		staleTime: 30 * 1000,
	});

	const handleLogout = async () => {
		setIsLoggingOut(true);
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
		setIsLoggingOut(false);
	};

	const handleSwitchAccount = async (session: DeviceSession) => {
		setSwitchingTo(session.session.id);
		setIsOpen(false);

		const result = await authClient.multiSession.setActive({
			sessionToken: session.session.token,
		});

		if (result.error) {
			toast.error(result.error.message || "Failed to switch account");
			setSwitchingTo(null);
			return;
		}

		queryClient.removeQueries({
			predicate: (query) => {
				const queryKey = query.queryKey;
				return !PRESERVED_QUERY_KEYS.some(
					(preserved) =>
						preserved.length <= queryKey.length &&
						preserved.every((key, i) => queryKey[i] === key)
				);
			},
		});

		toast.success(`Switched to ${session.user.name || session.user.email}`);
		router.refresh();
		setSwitchingTo(null);
	};

	const handleAddAccount = () => {
		setIsOpen(false);
		router.push("/login?add_account=true");
	};

	const handleSettings = () => {
		setIsOpen(false);
		router.push("/settings/account");
	};

	const handleBilling = () => {
		setIsOpen(false);
		router.push("/billing");
	};

	const getInitials = (
		name: string | null | undefined,
		email: string | null | undefined
	) => {
		if (name) {
			return name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
				.slice(0, 2);
		}
		return email?.[0]?.toUpperCase() || "U";
	};

	const userInitials = getInitials(user?.name, user?.email);

	const otherSessions =
		deviceSessions?.filter((session) => session.user.email !== user?.email) ??
		[];
	const hasMultipleAccounts = otherSessions.length > 0;

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger
						aria-label="Profile menu"
						className="flex size-8 items-center justify-center rounded-full outline-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						disabled={isLoggingOut || Boolean(switchingTo)}
					>
						<Avatar className="size-8">
							<AvatarImage
								alt={user?.name || "User"}
								src={user?.image || undefined}
							/>
							<AvatarFallback className="bg-primary text-primary-foreground text-xs">
								{userInitials}
							</AvatarFallback>
						</Avatar>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">
					<p>{user?.email ?? "Account"}</p>
				</TooltipContent>
			</Tooltip>

			<DropdownMenuContent align="start" className="w-56" side="right">
				{hasMultipleAccounts &&
					otherSessions.map((session) => (
						<DropdownMenuItem
							className="gap-2.5"
							disabled={switchingTo === session.session.id}
							key={session.session.id}
							onClick={() => handleSwitchAccount(session)}
						>
							<Avatar className="size-5">
								<AvatarImage
									alt={session.user.name}
									src={session.user.image || undefined}
								/>
								<AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
									{getInitials(session.user.name, session.user.email)}
								</AvatarFallback>
							</Avatar>
							<span className="min-w-0 flex-1 truncate text-sm">
								{session.user.email}
							</span>
							{switchingTo === session.session.id ? (
								<SpinnerGapIcon className="size-3.5 animate-spin text-muted-foreground" />
							) : (
								<CaretRightIcon className="size-3.5 text-muted-foreground" />
							)}
						</DropdownMenuItem>
					))}

				{hasMultipleAccounts && <DropdownMenuSeparator />}

				<DropdownMenuItem onClick={handleAddAccount}>
					<PlusIcon className="size-4" />
					Add account
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleSettings}>
					<GearIcon weight="duotone" />
					Settings
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleBilling}>
					<CreditCardIcon weight="duotone" />
					Billing
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={isLoggingOut}
					onClick={handleLogout}
					variant="destructive"
				>
					<SignOutIcon weight="duotone" />
					{isLoggingOut ? "Signing out…" : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
