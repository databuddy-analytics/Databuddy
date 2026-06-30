"use client";

import { authClient } from "@databuddy/auth/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ComponentPropsWithoutRef, useState } from "react";
import { toast } from "sonner";
import {
	CaretRightIcon,
	GearIcon,
	PlusIcon,
	SignOutIcon,
	SpinnerGapIcon,
} from "@databuddy/ui/icons";
import { Avatar, DropdownMenu } from "@databuddy/ui/client";
import { Text, Tooltip } from "@databuddy/ui";

export interface ProfileButtonUser {
	email?: string | null;
	id?: string;
	image?: string | null;
	name?: string | null;
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

export function getInitials(
	name: string | null | undefined,
	email: string | null | undefined
) {
	if (name) {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	}
	return email?.[0]?.toUpperCase() || "U";
}

function useProfileActions(_user: ProfileButtonUser | null) {
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [switchingTo, setSwitchingTo] = useState<string | null>(null);
	const router = useRouter();
	const queryClient = useQueryClient();

	const handleLogout = async () => {
		setIsLoggingOut(true);
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

	const navigateTo = (href: string) => {
		router.push(href);
	};

	return {
		isLoggingOut,
		switchingTo,
		handleLogout,
		handleSwitchAccount,
		navigateTo,
	};
}

type DropdownContentPlacement = Pick<
	ComponentPropsWithoutRef<typeof DropdownMenu.Content>,
	"align" | "side" | "sideOffset"
>;

export function ProfileDropdownContent({
	user,
	onClose,
	isOpen,
	align = "start",
	side = "top",
	sideOffset,
}: {
	isOpen?: boolean;
	onClose: () => void;
	user: ProfileButtonUser;
} & DropdownContentPlacement) {
	const {
		isLoggingOut,
		switchingTo,
		handleLogout,
		handleSwitchAccount,
		navigateTo,
	} = useProfileActions(user);

	const { data: deviceSessions } = useQuery({
		queryKey: ["device-sessions"],
		queryFn: async () => {
			const result = await authClient.multiSession.listDeviceSessions({});
			return result.data as DeviceSession[] | null;
		},
		enabled: isOpen,
		staleTime: 30 * 1000,
	});

	const otherSessions =
		deviceSessions?.filter((session) => session.user.email !== user.email) ??
		[];
	const hasMultipleAccounts = otherSessions.length > 0;

	return (
		<DropdownMenu.Content
			align={align}
			className="w-56"
			side={side}
			sideOffset={sideOffset}
		>
			{hasMultipleAccounts &&
				otherSessions.map((session) => (
					<DropdownMenu.Item
						disabled={switchingTo === session.session.id}
						key={session.session.id}
						onClick={() => {
							handleSwitchAccount(session);
							onClose();
						}}
					>
						<Avatar
							alt={session.user.name}
							className="size-5 text-[10px]"
							fallback={getInitials(session.user.name, session.user.email)}
							src={session.user.image || undefined}
						/>
						<Text className="min-w-0 flex-1 truncate" variant="body">
							{session.user.email}
						</Text>
						{switchingTo === session.session.id ? (
							<SpinnerGapIcon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
						) : (
							<CaretRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
						)}
					</DropdownMenu.Item>
				))}

			{hasMultipleAccounts && <DropdownMenu.Separator />}

			<DropdownMenu.Item
				onClick={() => {
					onClose();
					navigateTo("/login?add_account=true");
				}}
			>
				<PlusIcon className="size-4 shrink-0" />
				Add account
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onClick={() => {
					onClose();
					navigateTo("/settings/account");
				}}
			>
				<GearIcon className="size-4 shrink-0" weight="duotone" />
				Account settings
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item
				disabled={isLoggingOut}
				onClick={() => {
					handleLogout();
					onClose();
				}}
				variant="destructive"
			>
				<SignOutIcon className="size-4 shrink-0" weight="duotone" />
				{isLoggingOut ? "Signing out…" : "Sign out"}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	);
}

export function ProfileButtonClient({
	user,
}: {
	user: ProfileButtonUser | null;
}) {
	const [isOpen, setIsOpen] = useState(false);

	if (!user) {
		return null;
	}

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<Tooltip content={user.email ?? "Account"} side="top">
				<DropdownMenu.Trigger
					aria-label="Profile menu"
					className="flex size-8 items-center justify-center rounded-full transition-opacity duration-(--duration-quick) ease-(--ease-smooth) hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
					render={<button type="button" />}
				>
					<Avatar
						alt={user.name || "User"}
						className="size-8"
						fallback={getInitials(user.name, user.email)}
						src={user.image || undefined}
					/>
				</DropdownMenu.Trigger>
			</Tooltip>
			<ProfileDropdownContent
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				user={user}
			/>
		</DropdownMenu>
	);
}
