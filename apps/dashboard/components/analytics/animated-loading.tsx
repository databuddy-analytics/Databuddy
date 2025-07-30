'use client';

import {
	ActivitySquare,
	ArrowRight,
	Loader2,
	Server,
	Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AnimatedLoadingProps {
	type: 'sessions' | 'profiles' | 'errors';
	progress?: number;
	className?: string;
}

export function AnimatedLoading({
	type,
	progress: externalProgress,
	className,
}: AnimatedLoadingProps) {
	const [progress, setProgress] = useState(0);
	const [stage, setStage] = useState(0);
	const [fetchDetails, setFetchDetails] = useState('');

	// Different loading messages for each tab type
	const stages = {
		sessions: [
			'Establishing connection...',
			'Retrieving session data...',
			'Processing visitor journeys...',
			'Analyzing user behavior...',
			'Building timeline visualization...',
			'Almost there...',
		],
		profiles: [
			'Establishing connection...',
			'Retrieving visitor profiles...',
			'Analyzing visitor patterns...',
			'Calculating return visit rates...',
			'Correlating demographic data...',
			'Almost there...',
		],
		errors: [
			'Establishing connection...',
			'Retrieving error logs...',
			'Analyzing error patterns...',
			'Categorizing issues...',
			'Prioritizing critical errors...',
			'Almost there...',
		],
	};

	// Details specific to each type
	const fetchMessages = {
		sessions: [
			'Fetching session events',
			'Calculating session durations',
			'Mapping visitor journeys',
			'Analyzing bounce rates',
		],
		profiles: [
			'Fetching visitor devices',
			'Analyzing geographic data',
			'Processing user behaviors',
			'Identifying returning visitors',
		],
		errors: [
			'Retrieving error stacks',
			'Analyzing application errors',
			'Processing network issues',
			'Identifying browser-specific errors',
		],
	};

	const icons = {
		sessions: <ActivitySquare className="h-8 w-8 text-blue-500" />,
		profiles: <Users className="h-8 w-8 text-indigo-500" />,
		errors: <Server className="h-8 w-8 text-red-500" />,
	};

	const gradients = {
		sessions:
			'bg-gradient-to-br from-blue-50 to-sky-100 dark:from-blue-950/50 dark:to-sky-900/30',
		profiles:
			'bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-indigo-950/50 dark:to-purple-900/30',
		errors:
			'bg-gradient-to-br from-red-50 to-orange-100 dark:from-red-950/50 dark:to-orange-900/30',
	};

	// Update progress based on external or animated progress
	useEffect(() => {
		if (externalProgress !== undefined) {
			setProgress(externalProgress);

			// Update stage based on progress
			const stageIndex = Math.min(
				Math.floor((externalProgress / 100) * stages[type].length),
				stages[type].length - 1
			);
			setStage(stageIndex);
		} else {
			// Animated progress if no external progress is provided
			const interval = setInterval(() => {
				setProgress((prev) => {
					if (prev >= 100) {
						clearInterval(interval);
						return 100;
					}

					// Slow down progress as it increases
					const increment = Math.max(0.5, 3 - prev / 20);
					const newProgress = prev + increment;

					// Update stage based on progress
					const stageIndex = Math.min(
						Math.floor((newProgress / 100) * stages[type].length),
						stages[type].length - 1
					);
					setStage(stageIndex);

					return newProgress;
				});
			}, 150);

			return () => clearInterval(interval);
		}
	}, [externalProgress, type]);

	// Cycle through fetch details
	useEffect(() => {
		// Update fetch details message
		const updateFetchDetails = () => {
			const randomIndex = Math.floor(
				Math.random() * fetchMessages[type].length
			);
			setFetchDetails(fetchMessages[type][randomIndex]);
		};

		// Initial update
		updateFetchDetails();

		// Set interval to update periodically
		const intervalId = setInterval(updateFetchDetails, 2000);

		return () => {
			clearInterval(intervalId);
		};
	}, [type]);

	return (
		<div
			className={cn(
				'fade-in animate-in rounded-lg border p-8 shadow-sm',
				gradients[type],
				className
			)}
		>
			<div className="mx-auto flex max-w-lg flex-col items-center justify-center">
				<div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-background/80 shadow-sm backdrop-blur-sm">
					{icons[type]}
				</div>

				<h3 className="mb-2 text-center font-semibold text-xl">
					{stages[type][stage]}
				</h3>

				<div className="mb-6 w-full space-y-6">
					{/* Main progress bar */}
					<Progress className="h-2 w-full" value={progress} />

					{/* Progress details */}
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							{fetchDetails}{' '}
							<Loader2 className="ml-1 inline-block h-3 w-3 animate-spin" />
						</span>
						<Badge className="ml-auto font-mono" variant="outline">
							{Math.round(progress)}%
						</Badge>
					</div>
				</div>

				{/* Processing details */}
				<div className="w-full">
					<div className="flex flex-col space-y-3 text-sm">
						{[...new Array(4)].map((_, i) => {
							const isActive = progress > i * 25;
							const isPrevious = progress > (i + 1) * 25;

							return (
								<div
									className={cn(
										'flex items-center rounded-md p-2.5 transition-colors duration-300',
										isActive
											? 'bg-background/80 backdrop-blur-sm'
											: 'bg-transparent',
										isPrevious ? 'text-muted-foreground' : 'text-foreground'
									)}
									key={`${type}-${i + 1}`}
								>
									<div
										className={cn(
											'mr-3 flex h-4 w-4 items-center justify-center rounded-full',
											isActive ? 'bg-primary/20' : 'bg-muted'
										)}
									>
										{isPrevious ? (
											<div className="h-1.5 w-1.5 rounded-full bg-primary" />
										) : isActive ? (
											<Loader2 className="h-3 w-3 animate-spin text-primary" />
										) : null}
									</div>
									<span>{`Step ${i + 1}: ${fetchMessages[type][i % fetchMessages[type].length]}`}</span>
									{isPrevious && (
										<ArrowRight className="ml-auto h-3.5 w-3.5 text-primary" />
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
