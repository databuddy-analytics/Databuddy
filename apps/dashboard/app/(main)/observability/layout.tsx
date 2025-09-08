export default function ObservabilityLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
			{children}
		</div>
	);
}
