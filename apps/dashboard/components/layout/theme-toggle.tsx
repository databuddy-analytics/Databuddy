'use client';

import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeTogglerProps = {
	className?: string;
};

export function ThemeToggle({ className }: ThemeTogglerProps) {
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

	return (
		<Button
			aria-label="Toggle theme"
			className={cn(
				'relative hidden h-8 w-8 transition-all duration-200 hover:bg-accent/50 md:flex',
				className
			)}
			onClick={switchTheme}
			type="button"
			variant="ghost"
		>
			<SunIcon
				className={cn(
					'h-5 w-5 transition-all duration-300',
					theme === 'light' ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<MoonIcon
				className={cn(
					'absolute h-5 w-5 transition-all duration-300',
					theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<MonitorIcon
				className={cn(
					'absolute h-5 w-5 transition-all duration-300',
					theme === 'system' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
