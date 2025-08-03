import { redirect } from 'next/navigation';
import { useSession } from '@/components/layout/session-provider';

interface RedirectToSignUpProps {
	children: React.ReactNode;
}

export function RedirectToSignUp({ children }: RedirectToSignUpProps) {
	const { session } = useSession();

	if (!session) {
		redirect('/signup');
	}

	return <>{children}</>;
}
