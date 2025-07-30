import { authClient, useSession } from '@databuddy/auth/client';
import {
	CreditCardIcon,
	HouseIcon,
	SignOutIcon,
	UserIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export function UserMenu() {
	const { data: session } = useSession();
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const router = useRouter();

	const getUserInitials = () => {
		if (!session?.user?.name) {
			return 'U';
		}
		return session.user.name
			.split(' ')
			.map((n: string) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	};

	const handleLogout = async () => {
		setIsLoggingOut(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.success('Logged out successfully');
					router.push('/login');
				},
				onError: (error) => {
					router.push('/login');
					toast.error(error.error.message || 'Failed to log out');
				},
			},
		});
		setIsLoggingOut(false);
	};

	if (!session) {
		return (
			<div className="flex items-center gap-2">
				<Skeleton className="h-9 w-9 rounded-full" />
			</div>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="flex h-9 w-9 rounded-full" variant="ghost">
					<Avatar className="h-9 w-9 border border-border/50">
						<AvatarImage
							alt={session?.user?.name || 'User'}
							src={session?.user?.image || ''}
						/>
						<AvatarFallback className="bg-primary/10 font-medium text-primary text-sm">
							{getUserInitials()}
						</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56 p-2">
				<div className="mb-1 flex items-center justify-start gap-3 p-2">
					<Avatar className="h-9 w-9 border border-border/50">
						<AvatarImage
							alt={session?.user?.name || 'User'}
							src={session?.user?.image || ''}
						/>
						<AvatarFallback className="font-medium text-sm">
							{getUserInitials()}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col space-y-0.5">
						<span className="font-medium text-sm leading-none">
							{session?.user?.name || 'User'}
						</span>
						<span className="text-muted-foreground text-xs leading-none">
							{session?.user?.email || ''}
						</span>
					</div>
				</div>

				<DropdownMenuSeparator className="my-1" />

				<DropdownMenuGroup>
					<DropdownMenuItem asChild className="h-9 rounded-md">
						<Link className="flex w-full items-center" href="/websites">
							<HouseIcon
								className="mr-2.5 h-4 w-4"
								size={32}
								weight="duotone"
							/>
							Websites
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild className="h-9 rounded-md">
						<Link className="flex w-full items-center" href="/billing">
							<CreditCardIcon
								className="mr-2.5 h-4 w-4"
								size={32}
								weight="duotone"
							/>
							Billing
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild className="h-9 rounded-md">
						<Link
							className="flex w-full items-center"
							href="/settings?tab=profile"
						>
							<UserIcon className="mr-2.5 h-4 w-4" size={32} weight="duotone" />
							Profile
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator className="my-1" />

				<DropdownMenuItem
					className="h-9 cursor-pointer rounded-md text-destructive hover:bg-destructive/10 focus:text-destructive"
					disabled={isLoggingOut}
					onClick={handleLogout}
				>
					<SignOutIcon className="mr-2.5 h-5 w-5" size={32} weight="duotone" />
					{isLoggingOut ? 'Signing out...' : 'Sign out'}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
