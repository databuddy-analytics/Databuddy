import { authClient } from '@databuddy/auth/client';
import { SignOutIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';

export function SignOutButton() {
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const router = useRouter();

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

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={isLoggingOut ? 'Signing out...' : 'Sign out'}
					className="h-8 w-8 not-dark:text-primary hover:bg-destructive/10 hover:text-destructive"
					disabled={isLoggingOut}
					onClick={handleLogout}
					size="icon"
					variant="ghost"
				>
					<SignOutIcon
						className={isLoggingOut ? 'animate-pulse' : ''}
						size={16}
						weight="duotone"
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<p>{isLoggingOut ? 'Signing out...' : 'Sign out'}</p>
			</TooltipContent>
		</Tooltip>
	);
}
