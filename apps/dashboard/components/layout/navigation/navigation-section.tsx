import { memo } from 'react';
import { NavigationItem } from './navigation-item';
import type { NavigationSection as NavigationSectionType } from './types';

interface NavigationSectionProps {
	title: string;
	items: NavigationSectionType['items'];
	pathname: string;
	currentWebsiteId?: string | null;
}

const getPathInfo = (
	item: NavigationSectionType['items'][0],
	pathname: string,
	currentWebsiteId?: string | null
) => {
	let isActive: boolean;

	if (item.rootLevel) {
		isActive = pathname === item.href;
	} else if (currentWebsiteId === 'sandbox') {
		const fullPath = item.href === '' ? '/sandbox' : `/sandbox${item.href}`;
		isActive =
			item.href === '' ? pathname === '/sandbox' : pathname === fullPath;
	} else if (pathname.startsWith('/demo')) {
		const fullPath =
			item.href === ''
				? `/demo/${currentWebsiteId}`
				: `/demo/${currentWebsiteId}${item.href}`;
		isActive =
			item.href === ''
				? pathname === `/demo/${currentWebsiteId}`
				: pathname === fullPath;
	} else {
		const fullPath = `/websites/${currentWebsiteId}${item.href}`;
		isActive =
			item.href === ''
				? pathname === `/websites/${currentWebsiteId}`
				: pathname === fullPath;
	}

	return { isActive };
};

export const NavigationSection = memo(function NavigationSectionComponent({
	title,
	items,
	pathname,
	currentWebsiteId,
}: NavigationSectionProps) {
	return (
		<div>
			<h3 className="mb-2 px-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				{title}
			</h3>
			<ul className="ml-1 space-y-1">
				{items.map((item) => {
					const { isActive } = getPathInfo(item, pathname, currentWebsiteId);

					return (
						<li key={item.name}>
							<NavigationItem
								alpha={item.alpha}
								currentWebsiteId={currentWebsiteId}
								href={item.href}
								icon={item.icon}
								isActive={isActive}
								isExternal={item.external}
								isRootLevel={!!item.rootLevel}
								name={item.name}
								production={item.production}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
});
