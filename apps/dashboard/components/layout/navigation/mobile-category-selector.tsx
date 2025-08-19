'use client';

import { CaretDownIcon } from '@phosphor-icons/react';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWebsites } from '@/hooks/use-websites';
import { cn } from '@/lib/utils';
import {
	getDefaultCategory,
	getNavigationWithWebsites,
} from './navigation-config';

interface MobileCategorySelectorProps {
	onCategoryChange?: (categoryId: string) => void;
	selectedCategory?: string;
}

export function MobileCategorySelector({
	onCategoryChange,
	selectedCategory,
}: MobileCategorySelectorProps) {
	const pathname = usePathname();
	const { websites, isLoading: isLoadingWebsites } = useWebsites();

	const { categories, defaultCategory } = useMemo(() => {
		const config = getNavigationWithWebsites(
			pathname,
			websites,
			isLoadingWebsites
		);
		const defaultCat = getDefaultCategory(pathname);
		return { categories: config.categories, defaultCategory: defaultCat };
	}, [pathname, websites, isLoadingWebsites]);

	const activeCategory = selectedCategory || defaultCategory;
	const currentCategory = categories.find((cat) => cat.id === activeCategory);

	return (
		<div className="border-sidebar-border border-b p-3 md:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className="flex h-10 w-full items-center justify-between px-3"
						type="button"
						variant="outline"
					>
						<div className="flex items-center gap-2">
							{currentCategory?.icon && (
								<currentCategory.icon className="h-4 w-4" weight="duotone" />
							)}
							<span>{currentCategory?.name || 'Select Category'}</span>
						</div>
						<CaretDownIcon className="h-4 w-4" weight="fill" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
					{categories.map((category) => {
						const Icon = category.icon;
						const isActive = activeCategory === category.id;
						return (
							<DropdownMenuItem
								className={cn(
									'flex cursor-pointer items-center gap-2',
									isActive && 'bg-sidebar-accent text-sidebar-accent-foreground'
								)}
								key={category.id}
								onClick={() => onCategoryChange?.(category.id)}
							>
								<Icon
									className={cn(
										'h-4 w-4',
										isActive ? 'text-sidebar-ring' : 'text-muted-foreground'
									)}
									weight={isActive ? 'fill' : 'duotone'}
								/>
								<span>{category.name}</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
