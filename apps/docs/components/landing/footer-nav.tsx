'use client';

import { FaDiscord, FaEnvelope, FaGithub } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { SciFiButton } from './scifi-btn';

type NavItem = { title: string; link: string };
type NavSection = { header: string; items: NavItem[] };

function getIconForLink(item: NavItem) {
	const href = item.link.toLowerCase();
	if (href.startsWith('mailto:')) {
		return <FaEnvelope className="h-4 w-4" color="black" />;
	}
	if (href.includes('discord')) {
		return <FaDiscord className="h-4 w-4" color="black" />;
	}
	if (href.includes('github')) {
		return <FaGithub className="h-4 w-4" color="black" />;
	}
	if (href.includes('x.com') || item.title.toLowerCase().startsWith('x(')) {
		return <FaXTwitter className="h-4 w-4" color="black" />;
	}
	return null;
}

function FooterNavLinks({ navItems }: { navItems: NavSection[] }) {
	return (
		<div className="w-full">
			<div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3 lg:gap-12">
				{navItems.map((section) => (
					<div className="space-y-4 lg:space-y-6" key={section.header}>
						<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider sm:text-sm">
							{section.header}
						</h3>
						<div className="space-y-2 lg:space-y-3">
							{section.items.map((item) => {
								const icon = getIconForLink(item);
								const isExternal = item.link.startsWith('http');
								return (
									<div key={item.title}>
										<a
											className="inline-flex items-center gap-2 text-foreground text-sm transition-colors duration-200 hover:text-primary hover:underline hover:underline-offset-4 sm:text-base"
											href={item.link}
											rel={isExternal ? 'noopener noreferrer' : undefined}
											target={isExternal ? '_blank' : '_self'}
										>
											{icon ? (
												<span
													aria-hidden="true"
													className="text-muted-foreground"
												>
													{icon}
												</span>
											) : null}
											<span>{item.title}</span>
										</a>
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export const FooterNav = () => {
	const handleGetStarted = () => {
		const newWindow = window.open(
			'https://app.databuddy.cc/login',
			'_blank',
			'noopener,noreferrer'
		);
		if (
			!newWindow ||
			newWindow.closed ||
			typeof newWindow.closed === 'undefined'
		) {
			// Handle popup blocked case if needed
		}
	};

	const navItems = [
		{
			header: 'Product',
			items: [
				{
					title: 'Pricing',
					link: '/pricing',
				},
				{
					title: 'Dashboard',
					link: 'https://app.databuddy.cc',
				},
				{
					title: 'Documentation',
					link: '/docs',
				},
			],
		},
		{
			header: 'Company',
			items: [
				{
					title: 'Blog',
					link: '/blog',
				},
				{
					title: 'Privacy Policy',
					link: '/privacy',
				},
				{
					title: 'Terms & Conditions',
					link: '/terms',
				},
			],
		},
		{
			header: 'Contact',
			items: [
				{
					title: 'Discord',
					link: 'https://discord.com/invite/JTk7a38tCZ',
				},
				{
					title: 'Github',
					link: 'https://github.com/databuddy-analytics',
				},
				{
					title: 'X(Twitter)',
					link: 'https://x.com/trydatabuddy',
				},
				{
					title: 'support@databuddy.cc',
					link: 'mailto:support@databuddy.cc',
				},
			],
		},
	];

	return (
		<div className="w-full">
			{/* Mobile Layout */}
			<div className="block space-y-12 lg:hidden">
				{/* CTA Section */}
				<div className="space-y-6 text-center">
					<h2 className="font-medium text-2xl leading-tight sm:text-3xl">
						You're just one click away.
					</h2>
					<div>
						<SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
					</div>
				</div>

				{/* Navigation Links */}
				<div className="px-4">
					<FooterNavLinks navItems={navItems} />
				</div>
			</div>

			{/* Desktop Layout */}
			<div className="hidden items-start justify-between gap-16 lg:flex xl:gap-24">
				{/* CTA Section */}
				<div className="flex-shrink-0 space-y-6 xl:space-y-8">
					<h2 className="max-w-sm font-medium text-2xl leading-tight xl:text-3xl">
						You're just one click away.
					</h2>
					<div>
						<SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
					</div>
				</div>

				{/* Navigation Links */}
				<div className="max-w-2xl flex-1">
					<FooterNavLinks navItems={navItems} />
				</div>
			</div>
		</div>
	);
};
