'use client';

import {
	ArrowClockwiseIcon,
	CalendarIcon,
	CheckCircleIcon,
	ClockIcon,
	GlobeIcon,
	MapPinIcon,
	SparkleIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';

function getBrowserTimezone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatDate(
	date: Date,
	options: { timezone?: string; dateFormat?: string; timeFormat?: string }
) {
	const { timezone = getBrowserTimezone(), timeFormat = 'h:mm a' } = options;

	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: timeFormat?.includes('H') ? '2-digit' : 'numeric',
			minute: '2-digit',
			hour12: !timeFormat?.includes('H'),
		});

		return formatter.format(date);
	} catch {
		return date.toLocaleString();
	}
}

// Timezone data
const TIMEZONES = [
	{
		region: 'America/New_York',
		label: 'New York (EST/EDT)',
		offset: 'UTC-5/-4',
	},
	{ region: 'America/Chicago', label: 'Chicago (CST/CDT)', offset: 'UTC-6/-5' },
	{ region: 'America/Denver', label: 'Denver (MST/MDT)', offset: 'UTC-7/-6' },
	{
		region: 'America/Los_Angeles',
		label: 'Los Angeles (PST/PDT)',
		offset: 'UTC-8/-7',
	},
	{ region: 'Europe/London', label: 'London (GMT/BST)', offset: 'UTC+0/+1' },
	{ region: 'Europe/Paris', label: 'Paris (CET/CEST)', offset: 'UTC+1/+2' },
	{ region: 'Europe/Berlin', label: 'Berlin (CET/CEST)', offset: 'UTC+1/+2' },
	{ region: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 'UTC+9' },
	{ region: 'Asia/Shanghai', label: 'Shanghai (CST)', offset: 'UTC+8' },
	{ region: 'Asia/Kolkata', label: 'Mumbai (IST)', offset: 'UTC+5:30' },
	{
		region: 'Australia/Sydney',
		label: 'Sydney (AEST/AEDT)',
		offset: 'UTC+10/+11',
	},
	{
		region: 'Pacific/Auckland',
		label: 'Auckland (NZST/NZDT)',
		offset: 'UTC+12/+13',
	},
];

const DATE_FORMATS = [
	{ value: 'MMM D, YYYY', label: 'Jan 15, 2024' },
	{ value: 'DD/MM/YYYY', label: '15/01/2024' },
	{ value: 'MM/DD/YYYY', label: '01/15/2024' },
	{ value: 'YYYY-MM-DD', label: '2024-01-15' },
	{ value: 'D MMM YYYY', label: '15 Jan 2024' },
	{ value: 'MMMM D, YYYY', label: 'January 15, 2024' },
];

const TIME_FORMATS = [
	{ value: 'h:mm a', label: '1:30 PM' },
	{ value: 'HH:mm', label: '13:30' },
];

export function TimezonePreferences() {
	const { preferences, loading, updatePreferences, refetch } = usePreferences();
	const [localPreferences, setLocalPreferences] = useState({
		timezone: preferences?.timezone || 'auto',
		dateFormat: preferences?.dateFormat || 'MMM D, YYYY',
		timeFormat: preferences?.timeFormat || 'h:mm a',
	});
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState('timezone');
	const [hasChanges, setHasChanges] = useState(false);
	const [originalPreferences, setOriginalPreferences] =
		useState(localPreferences);

	// Sync local state with fetched preferences
	useEffect(() => {
		if (preferences) {
			const prefs = {
				timezone: preferences.timezone || 'auto',
				dateFormat: preferences.dateFormat || 'MMM D, YYYY',
				timeFormat: preferences.timeFormat || 'h:mm a',
			};
			setLocalPreferences(prefs);
			setOriginalPreferences(prefs);
		}
	}, [preferences]);

	// Check for changes
	useEffect(() => {
		setHasChanges(
			JSON.stringify(localPreferences) !== JSON.stringify(originalPreferences)
		);
	}, [localPreferences, originalPreferences]);

	// Save preferences
	const handleSave = async () => {
		try {
			setSaving(true);
			await updatePreferences(localPreferences);
			toast.success('Preferences saved successfully');
			setOriginalPreferences(localPreferences);
			setHasChanges(false);
			refetch();
		} catch (_error) {
			toast.error('Failed to save preferences');
		} finally {
			setSaving(false);
		}
	};

	const handleReset = () => {
		setLocalPreferences(originalPreferences);
		setHasChanges(false);
	};

	// Current date/time for examples
	const now = new Date();
	const currentTimezone =
		localPreferences.timezone === 'auto'
			? getBrowserTimezone()
			: localPreferences.timezone;
	const dateExample = formatDate(now, {
		timezone: currentTimezone,
		dateFormat: localPreferences.dateFormat,
		timeFormat: undefined,
	});

	const timeExample = formatDate(now, {
		timezone: currentTimezone,
		dateFormat: undefined,
		timeFormat: localPreferences.timeFormat,
	});

	const timezonesByOffset = Object.entries(
		TIMEZONES.reduce(
			(acc, tz) => {
				acc[tz.offset] = acc[tz.offset] || [];
				acc[tz.offset].push(tz);
				return acc;
			},
			{} as Record<string, typeof TIMEZONES>
		)
	).sort((a, b) => {
		return (
			Number.parseFloat(a[0].replace('UTC', '').replace('+', '')) -
			Number.parseFloat(b[0].replace('UTC', '').replace('+', ''))
		);
	});

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="flex items-center gap-2 text-muted-foreground">
					<ArrowClockwiseIcon
						className="h-4 w-4 animate-spin"
						size={16}
						weight="fill"
					/>
					<span className="text-sm">Loading preferences...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="fade-in slide-in-from-bottom-2 animate-in space-y-6 duration-300">
			{/* Current Settings Preview */}
			<Card className="border-muted/50 bg-gradient-to-br from-muted/20 to-muted/5">
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-500/20 bg-gradient-to-br from-blue-500/20 to-blue-600/5">
								<ClockIcon
									className="h-5 w-5 text-foreground"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-sm">Current Format</p>
								<p className="text-muted-foreground text-sm">
									{dateExample} • {timeExample}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Badge className="text-xs" variant="secondary">
								<MapPinIcon
									className="mr-1 h-3 w-3"
									size={16}
									weight="duotone"
								/>
								{currentTimezone.split('/').pop()?.replace('_', ' ')}
							</Badge>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Settings Tabs */}
			<Tabs className="w-full" onValueChange={setActiveTab} value={activeTab}>
				<TabsList className="mb-6 grid w-full grid-cols-3">
					<TabsTrigger className="flex items-center gap-2" value="timezone">
						<GlobeIcon className="h-4 w-4" size={16} weight="duotone" />
						<span className="hidden sm:inline">Timezone</span>
					</TabsTrigger>
					<TabsTrigger className="flex items-center gap-2" value="date">
						<CalendarIcon className="h-4 w-4" size={16} weight="duotone" />
						<span className="hidden sm:inline">Date</span>
					</TabsTrigger>
					<TabsTrigger className="flex items-center gap-2" value="time">
						<ClockIcon className="h-4 w-4" size={16} weight="duotone" />
						<span className="hidden sm:inline">Time</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent className="space-y-4" value="timezone">
					<div className="space-y-3">
						<h3 className="font-medium text-base">Select Timezone</h3>

						{/* Auto Detection */}
						<div className="rounded-lg border border-muted/50 bg-muted/20 p-3">
							<Button
								className="w-full justify-start gap-2"
								onClick={() =>
									setLocalPreferences({ ...localPreferences, timezone: 'auto' })
								}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										setLocalPreferences({
											...localPreferences,
											timezone: 'auto',
										});
									}
								}}
								size="sm"
								variant={
									localPreferences.timezone === 'auto' ? 'default' : 'outline'
								}
							>
								<GlobeIcon className="h-4 w-4" size={16} weight="duotone" />
								Auto-detect ({getBrowserTimezone()})
								{localPreferences.timezone === 'auto' && (
									<CheckCircleIcon
										className="ml-auto h-4 w-4"
										size={16}
										weight="duotone"
									/>
								)}
							</Button>
						</div>

						{/* Manual Selection */}
						<div className="overflow-hidden rounded-lg border border-muted/50">
							<div className="max-h-64 overflow-y-auto">
								{timezonesByOffset.map(([offset, zones]) => (
									<div
										className="border-muted/30 border-b last:border-0"
										key={offset}
									>
										<div className="bg-muted/40 px-4 py-2 font-medium text-sm">
											{offset}
										</div>
										<div className="p-1">
											{zones.map((tz) => (
												<div
													className={cn(
														'mx-1 my-0.5 cursor-pointer rounded-md px-3 py-2 text-sm transition-all duration-200',
														'hover:bg-accent hover:text-accent-foreground',
														localPreferences.timezone === tz.region &&
															'bg-primary text-primary-foreground'
													)}
													key={tz.region}
													onClick={() =>
														setLocalPreferences({
															...localPreferences,
															timezone: tz.region,
														})
													}
													onKeyDown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															setLocalPreferences({
																...localPreferences,
																timezone: tz.region,
															});
														}
													}}
												>
													<div className="flex items-center justify-between">
														<span>{tz.label}</span>
														{localPreferences.timezone === tz.region && (
															<CheckCircleIcon
																className="h-4 w-4"
																size={16}
																weight="duotone"
															/>
														)}
													</div>
												</div>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</TabsContent>

				<TabsContent className="space-y-4" value="date">
					<div className="space-y-3">
						<h3 className="font-medium text-base">Date Format</h3>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{DATE_FORMATS.map((option) => (
								<div
									className={cn(
										'cursor-pointer rounded-lg border border-muted/50 p-3 transition-all duration-200',
										'hover:border-accent-foreground/20 hover:bg-accent',
										localPreferences.dateFormat === option.value
											? 'border-primary bg-primary/5 ring-1 ring-primary/20'
											: ''
									)}
									key={option.value}
									onClick={() =>
										setLocalPreferences({
											...localPreferences,
											dateFormat: option.value,
										})
									}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											setLocalPreferences({
												...localPreferences,
												dateFormat: option.value,
											});
										}
									}}
								>
									<div className="flex items-center justify-between">
										<div>
											<div className="font-medium text-sm">{option.label}</div>
											<div className="mt-1 text-muted-foreground text-xs">
												{option.value}
											</div>
										</div>
										{localPreferences.dateFormat === option.value && (
											<CheckCircleIcon
												className="h-4 w-4 text-primary"
												size={16}
												weight="duotone"
											/>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				</TabsContent>

				<TabsContent className="space-y-4" value="time">
					<div className="space-y-3">
						<h3 className="font-medium text-base">Time Format</h3>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							{TIME_FORMATS.map((option) => (
								<div
									className={cn(
										'cursor-pointer rounded-lg border border-muted/50 p-3 transition-all duration-200',
										'hover:border-accent-foreground/20 hover:bg-accent',
										localPreferences.timeFormat === option.value
											? 'border-primary bg-primary/5 ring-1 ring-primary/20'
											: ''
									)}
									key={option.value}
									onClick={() =>
										setLocalPreferences({
											...localPreferences,
											timeFormat: option.value,
										})
									}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											setLocalPreferences({
												...localPreferences,
												timeFormat: option.value,
											});
										}
									}}
								>
									<div className="flex items-center justify-between">
										<div>
											<div className="font-medium text-sm">{option.label}</div>
											<div className="mt-1 text-muted-foreground text-xs">
												{option.value}
											</div>
										</div>
										{localPreferences.timeFormat === option.value && (
											<CheckCircleIcon
												className="h-4 w-4 text-primary"
												size={16}
												weight="duotone"
											/>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				</TabsContent>
			</Tabs>

			{/* Action Buttons */}
			{hasChanges && (
				<div className="fade-in slide-in-from-bottom-2 flex animate-in flex-col gap-3 border-muted/50 border-t pt-4 duration-200 sm:flex-row">
					<Button
						className="flex-1 sm:min-w-32 sm:flex-none"
						disabled={saving}
						onClick={handleSave}
					>
						{saving ? (
							<>
								<ArrowClockwiseIcon
									className="mr-2 h-4 w-4 animate-spin"
									size={16}
									weight="fill"
								/>
								Saving...
							</>
						) : (
							<>
								<CheckCircleIcon
									className="mr-2 h-4 w-4"
									size={16}
									weight="duotone"
								/>
								Save Changes
							</>
						)}
					</Button>
					<Button
						className="flex-1 sm:flex-none"
						onClick={handleReset}
						variant="outline"
					>
						Cancel
					</Button>
				</div>
			)}

			{/* Help Text */}
			<div className="rounded-lg border border-muted/50 bg-muted/30 p-4">
				<div className="flex items-start gap-3">
					<div className="rounded-md bg-primary/10 p-1">
						<SparkleIcon
							className="h-4 w-4 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div className="text-sm">
						<p className="mb-1 font-medium">🌍 Timezone & Format Tips</p>
						<ul className="space-y-1 text-muted-foreground leading-relaxed">
							<li>• Auto-detect uses your browser's timezone setting</li>
							<li>
								• Changes apply to all dates and times across the platform
							</li>
							<li>• Your team members will see times in their own timezone</li>
							<li>• Data exports will use your selected format</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}
