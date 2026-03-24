import "./global.css";
import { Databuddy } from "@databuddy/sdk/react";
import { RootProvider } from "fumadocs-ui/provider";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { SITE_URL } from "./util/constants";

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
	title: {
		template: "%s | Databuddy",
		default:
			"Databuddy — Privacy-first analytics, error tracking & feature flags",
	},
	description:
		"One lightweight layer for analytics, error tracking, and feature flags. Under 30 KB, no cookies, GDPR compliant by default. Open-source Google Analytics alternative.",
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
			<Databuddy
				clientId="OXmNQsViBT-FOS_wZCTHc"
				disabled={process.env.NODE_ENV === "development"}
				trackAttributes
				trackErrors
				trackOutgoingLinks
				trackWebVitals
			/>
			<Script
				data-project-id="1dee68c1-9213-4e17-a4bc-afcc38c8862c"
				src="https://ingest.promptwatch.com/js/client.min.js"
				strategy="afterInteractive"
			/>
			{process.env.NODE_ENV === "production" && (
				<>
					<Script
						dangerouslySetInnerHTML={{
							__html: `
								window.dataLayer = window.dataLayer || [];
								function gtag(){dataLayer.push(arguments);}
								gtag('js', new Date());
								gtag('config', 'AW-17988229504');
							`,
						}}
						id="gtag-init"
						strategy="beforeInteractive"
					/>
					<Script
						src="https://www.googletagmanager.com/gtag/js?id=AW-17988229504"
						strategy="afterInteractive"
					/>
				</>
			)}
			<body>
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
					<NuqsAdapter>
						<RootProvider>
							<main>{children}</main>
							<Toaster
								closeButton
								duration={1500}
								position="top-center"
								richColors
							/>
						</RootProvider>
					</NuqsAdapter>
				</ThemeProvider>
			</body>
		</html>
	);
}
