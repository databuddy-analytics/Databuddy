import { auth } from '@databuddy/auth';
import { CaretLeftIcon, SpinnerIcon } from '@phosphor-icons/react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Iridescence from '@/components/bits/Iridiscence';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';

export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({ headers: await headers() });

	if (session) {
		redirect('/websites');
	}

	return (
		<div className="flex h-screen">
			<div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 md:flex md:w-1/2">
				<div className="absolute inset-0">
					<Iridescence amplitude={0.2} color={[0.1, 0.2, 0.9]} speed={0.5} />
				</div>
				<Link className="relative z-10" href="https://www.databuddy.cc">
					<Button
						className="group scale-100 cursor-pointer border-white/10 bg-white/20 text-white transition-all duration-200 hover:scale-105 hover:bg-white/20"
						variant="outline"
					>
						<CaretLeftIcon className="h-4 w-4 transition-all duration-200 group-hover:translate-x-[-4px]" />
						Back
					</Button>
				</Link>
				<div className="relative z-10 text-white">
					<h1 className="mb-4 font-bold text-4xl">
						Build better <br />
						products with <br />
						Databuddy
					</h1>
					<p className="max-w-md text-white/70">
						Connect your data sources, build insights, and share them with your
						team.
					</p>
				</div>
			</div>
			<div className="flex w-full flex-col overflow-auto bg-background md:w-1/2">
				<div className="flex justify-center p-6 pt-8 md:p-8 md:pt-20">
					<Logo />
				</div>

				<div className="flex flex-1 items-center justify-center md:p-8 md:pt-0">
					<div className="w-full max-w-md">
						<Suspense
							fallback={
								<div className="flex h-40 items-center justify-center">
									<SpinnerIcon className="h-8 w-8 animate-spin text-primary" />
								</div>
							}
						>
							{children}
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	);
}
