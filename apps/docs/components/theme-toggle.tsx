'use client';

import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeToggleProps = {
	className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
	const { theme, setTheme } = useTheme();

	const switchTheme = () => {
		if (theme === 'system') {
			setTheme('light');
		} else if (theme === 'light') {
			setTheme('dark');
		} else {
			setTheme('system');
		}
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
				className={cn(
					'h-4 w-4 transition-all duration-300',
					theme === 'light' ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'
				)}
				size={16}
				weight="duotone"
			/>
			<MoonIcon
				className={cn(
					'absolute h-4 w-4 transition-all duration-300',
					theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={16}
				weight="duotone"
			/>
			<MonitorIcon
				className={cn(
					'absolute h-4 w-4 transition-all duration-300',
					theme === 'system' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={16}
				weight="duotone"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
