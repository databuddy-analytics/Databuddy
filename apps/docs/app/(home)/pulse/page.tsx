import { Footer } from "@/components/footer";
import { Pulse } from "@/components/landing/pulse";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export default function PulsePage() {
	return (
		<>
			<StructuredData
				page={{
					title:
						"Databuddy Pulse: Proactive Reliability Monitoring for Developers | Databuddy",
					description:
						"Don't just analyze downtime. Prevent it. Databuddy Pulse is the integrated uptime monitoring solution built for modern developers. 30-second checks, multi-protocol support, and intelligent alerting.",
					url: "https://www.databuddy.cc/pulse",
				}}
			/>
			<div className="overflow-hidden">
				{/* Pulse Section */}
				<Section className="border-border border-b py-16 lg:py-24" id="pulse">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<Pulse />
					</div>
				</Section>

				{/* Gradient Divider */}
				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>

				{/* Footer Section */}
				<Footer />

				{/* Final Gradient Divider */}
				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>
			</div>
		</>
	);
}
