import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
			<div className="text-center">
				<h1 className="mb-4 font-bold text-4xl text-white">Uptime Status</h1>
				<p className="mb-8 text-gray-400">
					View uptime statistics for your websites
				</p>
				<Link
					className="rounded bg-cyan-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-cyan-600"
					params={{ websiteId: "your-website-id" }}
					to="/$websiteId"
				>
					View Uptime
				</Link>
			</div>
		</div>
	);
}
