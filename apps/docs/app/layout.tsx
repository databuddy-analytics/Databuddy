import "./global.css";
import { Databuddy } from "@databuddy/sdk/react";
import { RootProvider } from "fumadocs-ui/provider";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "./util/constants";

const ltSuperior = localFont({
	src: [
		{ path: "../fonts/lt-superior/light.woff2", weight: "300" },
		{ path: "../fonts/lt-superior/regular.woff2", weight: "400" },
		{ path: "../fonts/lt-superior/medium.woff2", weight: "500" },
		{ path: "../fonts/lt-superior/semibold.woff2", weight: "600" },
		{ path: "../fonts/lt-superior/bold.woff2", weight: "700" },
		{ path: "../fonts/lt-superior/extrabold.woff2", weight: "800" },
	],
	variable: "--font-lt-superior",
	display: "swap",
});

const ltSuperiorMono = localFont({
	src: [
		{ path: "../fonts/lt-superior-mono/regular.woff2", weight: "400" },
		{ path: "../fonts/lt-superior-mono/medium.woff2", weight: "500" },
		{ path: "../fonts/lt-superior-mono/semibold.woff2", weight: "600" },
		{ path: "../fonts/lt-superior-mono/bold.woff2", weight: "700" },
	],
	variable: "--font-lt-superior-mono",
	display: "swap",
	preload: false,
});

export const metadata: Metadata = {
	title: {
		template: "%s | Databuddy",
		default:
			"Databuddy - Lightweight Developer Analytics, Error Tracking & Feature Flags",
	},
	description:
		"One script for analytics, error tracking, web vitals, and feature flags. Under 30 KB, no cookies, GDPR compliant. Free for small projects. Open-source Google Analytics alternative for developers.",
	authors: [{ name: "Databuddy Team" }],
	creator: "Databuddy",
	publisher: "Databuddy",
	metadataBase: new URL(SITE_URL),
	openGraph: {
		type: "website",
		locale: "en_US",
		siteName: "Databuddy",
		images: ["/og-image.png"],
	},
	twitter: {
		card: "summary_large_image",
		images: ["/og-image.png"],
		creator: "@databuddyps",
		site: "@databuddyps",
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
	appleWebApp: {
		title: "Databuddy",
	},
	pinterest: {
		richPin: false,
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "white" },
		{ media: "(prefers-color-scheme: dark)", color: "#0f172a" },
	],
	width: "device-width",
	initialScale: 1,
	userScalable: true,
};

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html
			className={`${ltSuperior.className} ${ltSuperior.variable} ${ltSuperiorMono.variable}`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="min-h-dvh">
				<ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
					<NuqsAdapter>
						<RootProvider>
							<div className="flex min-h-dvh flex-col">{children}</div>
							<Toaster
								closeButton
								duration={1500}
								position="top-center"
								richColors
							/>
						</RootProvider>
					</NuqsAdapter>
				</ThemeProvider>
				<Databuddy
					clientId="OXmNQsViBT-FOS_wZCTHc"
					disabled={process.env.NODE_ENV === "development"}
					trackAttributes
					trackErrors
					trackOutgoingLinks
					trackWebVitals
				/>
			</body>
		</html>
	);
}
