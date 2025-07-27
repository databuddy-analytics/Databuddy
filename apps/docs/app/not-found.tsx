'use client';

import { ArrowLeft, Home } from 'lucide-react';
import { Geist } from 'next/font/google';
import Link from 'next/link';
import LiquidChrome from '@/components/bits/liquid';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';

const geist = Geist({ subsets: ['latin'] });

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col bg-neutral-950">
			<Navbar />
			<div className="relative flex h-full w-full flex-grow flex-col items-center justify-center overflow-hidden p-4">
				{/* Liquid Chrome Background */}
				<div className="absolute inset-0 opacity-40">
					<LiquidChrome
						amplitude={0.2}
						frequencyX={3.0}
						frequencyY={2.2}
						interactive={true}
						speed={0.3}
					/>
				</div>

				{/* Gradient overlays for edge fading */}
				<div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent" />
				<div className="absolute inset-0 bg-gradient-to-b from-neutral-950/50 via-transparent" />

				{/* Main Content */}
				<div className="relative z-10 flex flex-col items-center text-center">
					<h1
						className={`mb-3 font-bold text-4xl text-white tracking-tighter md:text-5xl ${geist.className}`}
					>
						Page Not Found
					</h1>

					<p className="mb-8 max-w-sm text-neutral-400">
						The content you're looking for seems to have been moved or no longer
						exists.
					</p>

					<div className="flex w-full max-w-xs flex-col gap-4 sm:flex-row">
						<Button
							asChild
							className="flex-1 bg-sky-600 hover:bg-sky-700"
							size="lg"
						>
							<Link className={geist.className} href="/">
								<Home className="mr-2 h-4 w-4" />
								Go Home
							</Link>
						</Button>
						<Button
							className="flex-1 border-sky-500/20 hover:bg-sky-500/5"
							onClick={() => window.history.back()}
							size="lg"
							variant="outline"
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Go Back
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
