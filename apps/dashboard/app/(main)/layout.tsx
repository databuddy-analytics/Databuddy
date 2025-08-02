import { auth } from '@databuddy/auth';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { TopHeader } from '@/components/layout/top-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

async function AuthGuard({ children }: { children: React.ReactNode }) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		redirect('/login');
	}
	return <>{children}</>;
}

export default async function MainLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const cookieStore = await cookies();
	const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

	return (
		<AuthGuard>
			<SidebarProvider defaultOpen={defaultOpen}>
				<AppSidebar />
				<SidebarInset>
					<TopHeader />
					<div className="flex-1 overflow-y-auto overflow-x-hidden pt-16">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</AuthGuard>
	);
}
