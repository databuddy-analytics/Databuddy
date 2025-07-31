'use client';

import { ArrowLeft, Home } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
	const [mounted, setMounted] = useState(false);
	const [randomDigit, setRandomDigit] = useState('4');

	useEffect(() => {
		setMounted(true);

		const interval = setInterval(() => {
			const digits = ['0', '1', '4', '5', '?', '!', 'x'];
			const randomIndex = Math.floor(Math.random() * digits.length);
			setRandomDigit(digits[randomIndex]);
		}, 800);

		return () => clearInterval(interval);
	}, []);

	if (!mounted) {
		return null;
	}

	return (
		<div className="flex h-screen flex-col items-center justify-center bg-background p-4">
			<div className="absolute top-8 right-0 left-0 flex justify-center">
				<div className="flex items-center gap-2">
					<Logo />
				</div>
			</div>

			<div className="flex w-full max-w-md flex-col items-center">
				<div className="mb-4 flex items-baseline font-mono">
					<span className="font-bold text-8xl text-primary md:text-9xl">4</span>
					<div className="relative mx-2">
						<span className="animate-pulse font-bold text-8xl text-primary md:text-9xl">
							{randomDigit}
						</span>
						<div className="-z-10 absolute inset-0 rounded-full bg-primary/10 blur-xl" />
					</div>
					<span className="font-bold text-8xl text-primary md:text-9xl">4</span>
				</div>

				<div className="mb-4 h-px w-16 bg-border" />

				<div className="mb-6 text-4xl">
					<span
						aria-label="sad face"
						className="-rotate-90 inline-block transform text-5xl"
						role="img"
					>
						:(
					</span>
				</div>

				<h1 className="mb-2 text-center font-bold text-2xl md:text-3xl">
					Page Not Found
				</h1>

				<p className="mb-8 text-center text-muted-foreground">
					We&apos;ve lost this page in the data stream.
				</p>

				<div className="flex w-full max-w-xs flex-col gap-4 sm:flex-row">
					<Button
						asChild
						className="flex-1 bg-primary hover:bg-primary/90"
						variant="default"
					>
						<Link href="/websites">
							<Home className="mr-2 h-4 w-4" />
							Home
						</Link>
					</Button>

					<Button
						className="flex-1 border-primary/20 hover:bg-primary/5"
						onClick={() => window.history.back()}
						variant="outline"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Go Back
					</Button>
				</div>
			</div>

			<div className="absolute bottom-8 rounded-md border border-accent bg-accent/50 px-4 py-2 font-mono text-muted-foreground text-xs">
				<code>ERR_PAGE_NOT_FOUND @ {window.location.pathname}</code>
			</div>

			<div className="pointer-events-none absolute inset-0 overflow-hidden opacity-5">
				<div className="-right-24 -top-24 absolute h-96 w-96 rounded-full border-8 border-primary border-dashed" />
				<div className="-left-24 -bottom-24 absolute h-96 w-96 rounded-full border-8 border-primary border-dashed" />
			</div>
		</div>
	);
}
