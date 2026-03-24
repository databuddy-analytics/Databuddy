import "./globals.css";

import { Databuddy } from "@databuddy/sdk/react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import Providers from "./providers";

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
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_APP_URL || "https://app.databuddy.cc"
	),
	title: {
		template: "%s | Databuddy Dashboard",
		default: "Databuddy Dashboard",
	},
	description:
		"Powerful analytics dashboard for your websites. Track visitors, monitor performance, and gain insights into your audience.",
	keywords: [
		"analytics",
		"dashboard",
		"monitoring",
		"statistics",
		"web analytics",
		"tracking",
		"website insights",
		"visitor analytics",
		"performance monitoring",
		"user behavior",
	],
	authors: [{ name: "Databuddy", url: "https://www.databuddy.cc" }],
	creator: "Databuddy",
	publisher: "Databuddy",
	openGraph: {
		type: "website",
		locale: "en_US",
		url: "https://app.databuddy.cc",
		title: "Databuddy Dashboard",
		description:
			"Powerful analytics dashboard for your websites. Track visitors, monitor performance, and gain insights into your audience.",
		siteName: "Databuddy Dashboard",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Databuddy Dashboard Preview",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Databuddy Dashboard",
		description:
			"Powerful analytics dashboard for your websites. Track visitors, monitor performance, and gain insights into your audience.",
		images: ["/og-image.png"],
		creator: "@databuddy",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	alternates: {
		canonical: "https://app.databuddy.cc",
	},
	appleWebApp: {
		title: "Databuddy",
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
	],
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	userScalable: true,
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const isLocalhost = process.env.NODE_ENV === "development";

	return (
		<html
			className={`${ltSuperior.className} ${ltSuperior.variable} ${ltSuperiorMono.variable} h-full`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="flex h-full min-h-dvh flex-col bg-background text-foreground antialiased">
				<Providers>
					<main className="flex-1">{children}</main>
				</Providers>
				<Toaster />
				<Databuddy
					apiUrl={
						isLocalhost
							? "http://localhost:4000"
							: "https://basket.databuddy.cc"
					}
					clientId={
						isLocalhost
							? "5ced32e5-0219-4e75-a18a-ad9826f85698"
							: "3ed1fce1-5a56-4cb6-a977-66864f6d18e3"
					}
					trackAttributes={true}
					trackErrors={true}
					trackPerformance={true}
					trackWebVitals={true}
				/>
			</body>
		</html>
	);
}
