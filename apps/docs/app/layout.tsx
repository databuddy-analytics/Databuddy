import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Metadata, Viewport } from 'next';
import { Geist, Manrope } from 'next/font/google';
import Head from 'next/head';
import Script from 'next/script';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

const geist = Geist({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
	variable: '--font-geist',
});

const manrope = Manrope({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
	variable: '--font-manrope',
});

export const metadata: Metadata = {
	title:
		'Privacy-first web analytics (Google Analytics alternative) — 3 KB, GDPR-compliant | Databuddy',
	description:
		'Experience powerful, privacy-first analytics that matches Google Analytics feature-for-feature without compromising user data. Zero cookies required, 100% data ownership, and AI-powered insights to help your business grow while staying compliant.',
	keywords: [
		'analytics',
		'web analytics',
		'privacy',
		'GDPR compliant',
		'cookieless',
		'website tracking',
		'data ownership',
		'performance analytics',
		'AI analytics',
		'privacy-first',
	],
	authors: [{ name: 'Databuddy Team' }],
	creator: 'Databuddy',
	publisher: 'Databuddy',
	metadataBase: new URL('https://www.databuddy.cc'),
	openGraph: {
		type: 'website',
		locale: 'en_US',
		url: 'https://www.databuddy.cc',
		title:
			'Privacy-first web analytics (Google Analytics alternative) — 3 KB, GDPR-compliant | Databuddy',
		description:
			'Experience powerful, privacy-first analytics that matches Google Analytics feature-for-feature without compromising user data. Zero cookies required, 100% data ownership, and AI-powered insights to help your business grow while staying compliant.',
		siteName: 'Databuddy',
		images: [
			{
				url: 'og.webp',
				width: 1200,
				height: 630,
				alt: 'Databuddy Dashboard',
			},
		],
	},
	twitter: {
		card: 'summary_large_image',
		title:
			'Privacy-first web analytics (Google Analytics alternative) — 3 KB, GDPR-compliant | Databuddy',
		description:
			'Experience powerful, privacy-first analytics that matches Google Analytics feature-for-feature without compromising user data. Zero cookies required, 100% data ownership, and AI-powered insights to help your business grow while staying compliant.',
		images: ['og.webp'],
		creator: '@databuddyps',
		site: '@databuddyps',
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			'max-video-preview': -1,
			'max-image-preview': 'large',
			'max-snippet': -1,
		},
	},
	alternates: {
		canonical: 'https://www.databuddy.cc',
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: 'white' },
		{ media: '(prefers-color-scheme: dark)', color: '#0f172a' },
	],
	width: 'device-width',
	initialScale: 1,
	userScalable: true,
};

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html
			className={`${geist.className} ${manrope.className}`}
			lang="en"
			suppressHydrationWarning
		>
			<Script
				async
				data-client-id="OXmNQsViBT-FOS_wZCTHc"
				data-track-attributes={true}
				data-track-errors={true}
				data-track-outgoing-links={true}
				data-track-web-vitals={true}
				src="https://cdn.databuddy.cc/databuddy.js"
				strategy="afterInteractive"
			/>
			<Head>
				<link href="https://icons.duckduckgo.com" rel="preconnect" />
				<link href="https://icons.duckduckgo.com" rel="dns-prefetch" />
			</Head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
					<RootProvider>
						<main>{children}</main>
					</RootProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
