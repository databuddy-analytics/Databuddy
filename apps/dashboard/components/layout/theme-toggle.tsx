'use client';

import { MonitorIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeTogglerProps = {
	className?: string;
};

export function ThemeToggle({ className }: ThemeTogglerProps) {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const switchTheme = () => {
		if (theme === 'system') {
			setTheme('light');
		} else if (theme === 'light') {
			setTheme('dark');
		} else {
			setTheme('system');
		}
	};

	if (!mounted) {
		return (
			<Button
				aria-label="Toggle theme"
				className={cn(
					'relative hidden h-8 w-8 transition-all duration-200 hover:bg-accent/50 md:flex',
					className
				)}
				type="button"
				variant="ghost"
			>
				<SunIcon className="h-5 w-5 opacity-0" size={32} weight="duotone" />
				<span className="sr-only">Toggle theme</span>
			</Button>
		);
	}

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
					'h-5 w-5 transition-all duration-300 not-dark:text-primary',
					theme === 'light' ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<MoonIcon
				className={cn(
					'absolute h-5 w-5 transition-all duration-300 not-dark:text-primary',
					theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<MonitorIcon
				className={cn(
					'absolute h-5 w-5 transition-all duration-300 not-dark:text-primary',
					theme === 'system' ? 'scale-100 rotate-0' : 'scale-0 rotate-90'
				)}
				size={32}
				weight="duotone"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}
