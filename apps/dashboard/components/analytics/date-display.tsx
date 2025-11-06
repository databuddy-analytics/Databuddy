"use client";

import { usePreferences } from "@/hooks/use-preferences";

interface DateDisplayProps {
	date: string | Date;
	showTime?: boolean;
	customFormat?: string;
}

export function DateDisplay({
	date,
	showTime,
	customFormat,
}: DateDisplayProps) {
	const { formatDate, loading } = usePreferences();

	if (loading) {
		return <span className="text-muted-foreground">Loading...</span>;
	}

	return (
		<time dateTime={new Date(date).toISOString()}>
			{formatDate(date, { showTime, customFormat })}
		</time>
	);
}

interface RelativeDateDisplayProps {
	date: string | Date;
	className?: string;
}

export function RelativeDateDisplay({
	date,
	className,
}: RelativeDateDisplayProps) {
	const { loading } = usePreferences();

	if (loading) {
		return <span className="text-muted-foreground">Loading...</span>;
	}

	const now = new Date();
	const pastDate = new Date(date);
	const diffInSeconds = Math.floor((now.getTime() - pastDate.getTime()) / 1000);

	if (diffInSeconds < 60) {
		return <span className={className}>Just now</span>;
	}

	if (diffInSeconds < 3600) {
		const minutes = Math.floor(diffInSeconds / 60);
		return (
			<span className={className}>
				{minutes} minute{minutes !== 1 ? "s" : ""} ago
			</span>
		);
	}

	if (diffInSeconds < 86_400) {
		const hours = Math.floor(diffInSeconds / 3600);
		return (
			<span className={className}>
				{hours} hour{hours !== 1 ? "s" : ""} ago
			</span>
		);
	}

	if (diffInSeconds < 2_592_000) {
		const days = Math.floor(diffInSeconds / 86_400);
		return (
			<span className={className}>
				{days} day{days !== 1 ? "s" : ""} ago
			</span>
		);
	}

	if (diffInSeconds < 31_536_000) {
		const months = Math.floor(diffInSeconds / 2_592_000);
		return (
			<span className={className}>
				{months} month{months !== 1 ? "s" : ""} ago
			</span>
		);
	}

	const years = Math.floor(diffInSeconds / 31_536_000);
	return (
		<span className={className}>
			{years} year{years !== 1 ? "s" : ""} ago
		</span>
	);
}
