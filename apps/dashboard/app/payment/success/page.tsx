import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ds/button";

export default function PaymentSuccess() {
	return (
		<div className="flex h-dvh flex-col items-center justify-center bg-background p-4 sm:p-6">
			<div className="absolute top-8 right-0 left-0 flex justify-center">
				<Logo />
			</div>

			<div className="flex w-full max-w-sm flex-col items-center text-center">
				<div
					aria-hidden="true"
					className="flex size-12 items-center justify-center rounded bg-green-500/10"
				>
					<CheckCircleIcon className="size-6 text-green-500" weight="duotone" />
				</div>

				<div className="mt-6 space-y-2">
					<h1 className="text-balance font-semibold text-foreground text-lg">
						Payment Successful
					</h1>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						Thank you for your purchase. You now have access to all premium
						features.
					</p>
				</div>

				<Button asChild className="mt-8 w-full" size="lg">
					<Link href="/websites">Go to Dashboard</Link>
				</Button>
			</div>
		</div>
	);
}
