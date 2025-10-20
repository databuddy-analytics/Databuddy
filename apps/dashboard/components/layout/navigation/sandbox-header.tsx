import { CaretLeftIcon, TestTubeIcon } from '@phosphor-icons/react';
import Link from 'next/link';

export function SandboxHeader() {
	return (
		<div className="border-sidebar-border border-b bg-sidebar-accent">
			{/* Sandbox info - aligned with logo section */}
			<div className="flex h-12 items-center border-sidebar-border border-b bg-gradient-to-r from-sidebar-accent to-sidebar-accent/80 px-3">
				<div className="flex w-full items-center gap-3">
					<div className="rounded-lg bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-sidebar-border/50">
						<TestTubeIcon
							className="size-5 flex-shrink-0 text-sidebar-ring"
							weight="duotone"
						/>
					</div>
					<div className="flex min-w-0 flex-1 flex-col items-start">
						<h2 className="truncate text-left font-semibold text-sidebar-accent-foreground text-sm">
							Sandbox
						</h2>
						<p className="truncate text-left text-sidebar-accent-foreground/70 text-xs">
							Test & Experiment
						</p>
					</div>
				</div>
			</div>

			{/* Back navigation - aligned with category buttons */}
			<button
				className="flex items-center justify-start px-3 py-2 transition-colors hover:bg-sidebar-accent/60"
				type="button"
			>
				<Link className="flex items-center gap-2" href="/">
					<CaretLeftIcon
						className="hover:-translate-x-0.5 h-5 w-5 flex-shrink-0 text-sidebar-accent-foreground/80 transition-transform"
						weight="fill"
					/>
					<span className="text-sidebar-accent-foreground/70 text-xs">
						Back to Dashboard
					</span>
				</Link>
			</button>
		</div>
	);
}
