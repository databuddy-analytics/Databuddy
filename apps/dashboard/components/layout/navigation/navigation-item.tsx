import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { NavigationItem as NavigationItemType } from './types';

interface NavigationItemProps extends Omit<NavigationItemType, 'icon'> {
	icon: NavigationItemType['icon'];
	isActive: boolean;
	isRootLevel: boolean;
	isExternal?: boolean;
	currentWebsiteId?: string | null;
}

export function NavigationItem({
	name,
	icon: Icon,
	href,
	alpha,
	isActive,
	isRootLevel,
	isExternal,
	production,
	currentWebsiteId,
}: NavigationItemProps) {
	const fullPath = useMemo(() => {
		if (isRootLevel) {
			return href;
		}
		if (currentWebsiteId === 'sandbox') {
			return href === '' ? '/sandbox' : `/sandbox${href}`;
		}
		return `/websites/${currentWebsiteId}${href}`;
	}, [href, isRootLevel, currentWebsiteId]);

	const LinkComponent = isExternal ? 'a' : Link;

	if (production === false && process.env.NODE_ENV === 'production') {
		return null;
	}

	const linkProps = isExternal
		? { href, target: '_blank', rel: 'noopener noreferrer' }
		: {
				href: fullPath,
				prefetch: true,
			};

	return (
		<LinkComponent
			{...linkProps}
			aria-current={isActive ? 'page' : undefined}
			aria-label={`${name}${isExternal ? ' (opens in new tab)' : ''}`}
			className={cn(
				'group flex items-center gap-x-3 rounded px-3 py-2 text-sm transition-all duration-200',
				'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1',
				isActive
					? 'bg-accent font-medium text-foreground shadow-sm'
					: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
			)}
			data-is-external={isExternal ? 'true' : 'false'}
			data-nav-item={name.toLowerCase().replace(/\s+/g, '-')}
			data-nav-section={isRootLevel ? 'main-nav' : 'website-nav'}
			data-nav-type={isRootLevel ? 'main' : 'website'}
			data-track="navigation-click"
			role="menuitem"
		>
			<span className="flex-shrink-0">
				<Icon
					aria-hidden="true"
					className={cn(
						'h-5 w-5 transition-colors duration-200',
						isActive
							? 'text-primary'
							: 'not-dark:text-primary group-hover:text-primary'
					)}
					size={32}
					weight="duotone"
				/>
			</span>
			<span className="flex-grow truncate">{name}</span>
			<div className="flex items-center gap-1.5">
				{alpha && (
					<span className="font-mono text-muted-foreground text-xs">ALPHA</span>
				)}
				{isExternal && (
					<ArrowSquareOutIcon
						aria-hidden="true"
						className="h-3 w-3 not-dark:text-primary text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100"
						weight="duotone"
					/>
				)}
			</div>
		</LinkComponent>
	);
}
