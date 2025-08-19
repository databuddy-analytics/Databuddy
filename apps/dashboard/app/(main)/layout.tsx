import { auth } from '@databuddy/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';

async function AuthGuard({ children }: { children: React.ReactNode }) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		redirect('/login');
	}
	return <>{children}</>;
}

export default function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<AuthGuard>
			<div className="h-screen overflow-hidden text-foreground">
				<Sidebar />
				<div className="relative h-screen pl-0 md:pl-84">
					<div className="h-screen overflow-y-auto overflow-x-hidden pt-16 md:pt-0">
						{children}
					</div>
				</div>
			</div>
		</AuthGuard>
	);
}
