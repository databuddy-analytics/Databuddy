import { CaretLeftIcon, SpinnerIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Suspense } from "react";
import Iridescence from "@/components/bits/Iridiscence";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-dvh">
			<div className="relative hidden flex-col items-start justify-between overflow-hidden p-12 md:flex md:w-1/2">
				<div className="absolute inset-0">
					<Iridescence
						amplitude={0.1}
						color={[0.1, 0.1, 0.1]}
						mouseReact={false}
						speed={0.5}
					/>
				</div>
				<Link className="relative z-10" href="https://www.databuddy.cc">
					<Button
						className="group px-0! text-white/50 hover:bg-transparent hover:text-white/80"
						variant="ghost"
					>
						<CaretLeftIcon className="size-4 transition-transform duration-200 group-hover:translate-x-[-4px]" />
						Back
					</Button>
				</Link>
				<div className="relative z-10">
					<h1 className="mb-2 w-full max-w-sm font-medium text-4xl text-white/60 leading-[46px]">
						Build <span className="text-white">better products</span> with
						Databuddy
					</h1>
					<p className="max-w-sm text-white/90">
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
									<SpinnerIcon className="size-8 animate-spin text-primary" />
								</div>
							}
						>
							{children}
						</Suspense>
					</div>
				</div>

				<div className="flex justify-center p-6 pb-8 text-center text-muted-foreground text-sm">
					<p>
						Powered by{" "}
						<a
							className="font-medium text-foreground hover:underline"
							href="https://www.databuddy.cc"
							rel="noopener noreferrer dofollow"
							target="_blank"
						>
							Databuddy
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
