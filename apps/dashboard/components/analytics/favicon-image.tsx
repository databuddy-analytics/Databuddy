'use client';

import { GlobeIcon } from '@phosphor-icons/react';
import Image from 'next/image';
import { useState } from 'react';

interface FaviconImageProps {
	domain: string;
	altText?: string;
	size?: number;
	className?: string;
	fallbackIcon?: React.ReactNode;
}

const hostnameRegex = /^https?:\/\//;
const wwwRegex = /^www\./;

export function FaviconImage({
	domain,
	altText,
	size = 20,
	className = '',
	fallbackIcon,
}: FaviconImageProps) {
	const [error, setError] = useState(false);

	const hostname = domain
		.replace(hostnameRegex, '')
		.replace(wwwRegex, '')
		.split('/')[0]
		.split('?')[0]
		.split('#')[0];

	const invalid =
		!hostname ||
		hostname.length < 3 ||
		!hostname.includes('.') ||
		hostname === 'direct' ||
		hostname === 'unknown' ||
		hostname.includes('localhost') ||
		hostname.includes('127.0.0.1');

	if (invalid || error) {
		return (
			<div
				className={`${className} flex items-center justify-center rounded-sm`}
				style={{ width: size, height: size }}
			>
				{fallbackIcon || (
					<GlobeIcon
						aria-label={altText || 'Website icon'}
						className="not-dark:text-primary text-muted-foreground"
						size={size}
						weight="duotone"
					/>
				)}
			</div>
		);
	}

	const isGitHub = hostname === 'github.com';

	return (
		<Image
			alt={altText || `${domain} favicon`}
			className={`${className} ${isGitHub ? 'dark:invert ' : ''}`}
			height={size}
			onError={() => setError(true)}
			src={`https://icons.duckduckgo.com/ip3/${hostname}.ico`}
			width={size}
		/>
	);
}
