import { CheckCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function PaymentSuccess() {
	return (
		<div className="flex h-screen flex-col items-center justify-center bg-background p-4">
			<div className="absolute top-8 right-0 left-0 flex justify-center">
				<div className="flex items-center gap-2">
					<Logo />
				</div>
			</div>

			<div className="flex w-full max-w-md flex-col items-center">
				<CheckCircle
					className="mb-4 h-20 w-20 text-green-500"
					weight="duotone"
				/>
				<h1 className="mb-2 text-center font-bold text-2xl md:text-3xl">
					Payment Successful!
				</h1>
				<p className="mb-6 text-center text-muted-foreground">
					Thank you for your purchase. Your payment was processed successfully.
					<br />
					You now have access to all premium features.
				</p>
				<Button
					asChild
					className="w-full bg-primary hover:bg-primary/90"
					size="lg"
				>
					<Link href="/websites">Go to Dashboard</Link>
				</Button>
			</div>

			<div className="absolute bottom-8 rounded-md border border-accent bg-accent/50 px-4 py-2 font-mono text-muted-foreground text-xs">
				<code>PAYMENT_SUCCESS @ /payment/success</code>
			</div>

			<div className="pointer-events-none absolute inset-0 overflow-hidden opacity-5">
				<div className="-right-24 -top-24 absolute h-96 w-96 rounded-full border-8 border-green-500 border-dashed" />
				<div className="-left-24 -bottom-24 absolute h-96 w-96 rounded-full border-8 border-green-500 border-dashed" />
			</div>
		</div>
	);
}
