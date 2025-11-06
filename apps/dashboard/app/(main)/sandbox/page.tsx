"use client";

export default function SandboxPage() {
	return (
		<div className="container mx-auto max-w-6xl p-6">
			<div className="mb-6">
				<h1 className="mb-2 font-bold text-2xl text-foreground">Sandbox</h1>
				<p className="text-muted-foreground">
					Test and experiment with new features and functionality
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<div className="rounded-lg border p-6 transition-shadow hover:shadow-md">
					<h3 className="mb-2 font-semibold text-lg">Reddit Mentions</h3>
					<p className="mb-4 text-muted-foreground">
						Track mentions of your brand or keywords across Reddit
					</p>
					<a
						className="text-primary hover:underline"
						href="/sandbox/reddit-mentions"
					>
						View Test →
					</a>
				</div>

				<div className="rounded-lg border p-6 transition-shadow hover:shadow-md">
					<h3 className="mb-2 font-semibold text-lg">API Testing</h3>
					<p className="mb-4 text-muted-foreground">
						Test API endpoints and data structures
					</p>
					<a
						className="text-primary hover:underline"
						href="/sandbox/api-testing"
					>
						View Test →
					</a>
				</div>

				<div className="rounded-lg border p-6 transition-shadow hover:shadow-md">
					<h3 className="mb-2 font-semibold text-lg">UI Components</h3>
					<p className="mb-4 text-muted-foreground">
						Test new UI components and layouts
					</p>
					<a
						className="text-primary hover:underline"
						href="/sandbox/ui-components"
					>
						View Test →
					</a>
				</div>
			</div>
		</div>
	);
}
