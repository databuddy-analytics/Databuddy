import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { Navbar } from '@/components/navbar';

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<HomeLayout {...baseOptions}>
			<div className="flex min-h-screen flex-col font-manrope">
				<Navbar />
				<main className="flex-1">{children}</main>
			</div>
		</HomeLayout>
	);
}
