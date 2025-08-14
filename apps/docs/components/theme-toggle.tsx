'use client';

import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeToggleProps = {
	className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
	const { resolvedTheme, setTheme } = useTheme();

	const switchTheme = () => {
		setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
	};

	const toggleTheme = () => {
		if (document.startViewTransition) {
			document.startViewTransition(switchTheme);
		} else {
			switchTheme();
		}
	};

	return (
		<Button
			className={cn('relative h-8 w-8', className)}
			onClick={toggleTheme}
			size="sm"
			variant="ghost"
		>
			<SunIcon
				className="dark:-rotate-90 h-4 w-4 rotate-0 scale-100 transition-all dark:scale-0"
				size={16}
				weight="duotone"
			/>
			<MoonIcon
				className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
				size={16}
				weight="duotone"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
