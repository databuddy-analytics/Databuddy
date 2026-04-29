import "./globals.css";

import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DATABUDDY_UPTIME_URL, STATUS_URL } from "@/lib/status-url";

const ltSuperior = localFont({
	src: [
		{ path: "../fonts/lt-superior/light.otf", weight: "300" },
		{ path: "../fonts/lt-superior/regular.otf", weight: "400" },
		{ path: "../fonts/lt-superior/medium.otf", weight: "500" },
		{ path: "../fonts/lt-superior/semibold.otf", weight: "600" },
		{ path: "../fonts/lt-superior/bold.otf", weight: "700" },
		{ path: "../fonts/lt-superior/extrabold.otf", weight: "800" },
	],
	variable: "--font-lt-superior",
	display: "swap",
});

const ltSuperiorMono = localFont({
	src: [
		{ path: "../fonts/lt-superior-mono/regular.otf", weight: "400" },
		{ path: "../fonts/lt-superior-mono/medium.otf", weight: "500" },
		{ path: "../fonts/lt-superior-mono/semibold.otf", weight: "600" },
		{ path: "../fonts/lt-superior-mono/bold.otf", weight: "700" },
	],
	variable: "--font-lt-superior-mono",
	display: "swap",
});

export const metadata: Metadata = {
	metadataBase: new URL(STATUS_URL),
	applicationName: "Databuddy Status",
	title: {
		template: "%s | Databuddy Status",
		default: "Databuddy Status Pages",
	},
	description:
		"Live uptime, incident history, and service health for public Databuddy status pages.",
	keywords: [
		"status page",
		"uptime monitoring",
		"incident history",
		"service status",
		"Databuddy uptime",
	],
	authors: [{ name: "Databuddy", url: DATABUDDY_UPTIME_URL }],
	creator: "Databuddy",
	publisher: "Databuddy",
	category: "technology",
	icons: {
		icon: [
			{ url: "/icon0.svg", type: "image/svg+xml" },
			{ url: "/icon1.png", sizes: "96x96", type: "image/png" },
		],
		shortcut: [{ url: "/icon0.svg", type: "image/svg+xml" }],
		apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
	},
	manifest: "/manifest.webmanifest",
	openGraph: {
		title: "Databuddy Status Pages",
		description:
			"Live uptime, incident history, and service health for public Databuddy status pages.",
		url: STATUS_URL,
		siteName: "Databuddy Status",
		type: "website",
		locale: "en_US",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	},
	twitter: {
		card: "summary",
		title: "Databuddy Status Pages",
		description:
			"Live uptime, incident history, and service health for public Databuddy status pages.",
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
	],
	width: "device-width",
	initialScale: 1,
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			className={`${ltSuperior.className} ${ltSuperior.variable} ${ltSuperiorMono.variable}`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="min-h-dvh bg-background text-foreground antialiased">
				{children}
				<Analytics />
			</body>
		</html>
	);
}
