import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getDeviceTypeIcon } from '@/app/(main)/websites/[id]/_components/utils/technology-helpers';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getOrganizationInitials(name: string): string {
	return name
		.split(' ')
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}

export function formatDuration(seconds: number): string {
	if (!seconds || seconds < 60) {
		return `${Math.round(seconds || 0)}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);

	if (minutes < 60) {
		return remainingSeconds > 0
			? `${minutes}m ${remainingSeconds}s`
			: `${minutes}m`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function getDefaultDateRange() {
	const today = new Date();
	const thirtyDaysAgo = new Date(today);
	thirtyDaysAgo.setDate(today.getDate() - 30);
	return {
		start_date: thirtyDaysAgo.toISOString().split('T')[0],
		end_date: today.toISOString().split('T')[0],
		granularity: 'daily' as 'hourly' | 'daily',
	};
}

export function getDeviceIcon(device: string, size: 'sm' | 'md' | 'lg' = 'md') {
	return getDeviceTypeIcon(device, size);
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}