import { Skeleton } from '@/components/ui/skeleton';

export function ChatSkeleton() {
	return (
		<div className="flex size-full items-center justify-center gap-2 divide-x divide-border">
			<div className="relative flex size-full flex-col rounded-2xl border border-border transition-all duration-300 ease-in-out">
				{/* Header (matches ChatHeader) */}
				<div className="relative z-10 flex w-full justify-between rounded-t-2xl border-border border-b bg-background px-6 py-6">
					<div className="flex items-center">
						<Skeleton className="h-8 w-8 rounded" />
					</div>

					<div className="flex items-center justify-center transition-all duration-300 ease-in-out">
						<Skeleton className="h-4 w-48" />
					</div>

					<div className="flex items-center space-x-4 transition-all duration-300 ease-in-out">
						<Skeleton className="h-8 w-8 rounded" />
					</div>
				</div>

				{/* Messages container (matches Messages wrapper) */}
				<div className="relative flex h-full flex-1 flex-col overflow-y-auto px-6 pb-6">
					<div className="flex min-w-0 flex-col gap-4 md:gap-6">
						<div className="flex h-full flex-col gap-2 md:gap-4 md:px-4">
							{Array.from({ length: 6 }).map((_, i) => (
								<div
									className={
										i % 2 === 0
											? 'group flex w-full items-end justify-end gap-2'
											: 'group flex w-full flex-row-reverse items-end justify-end gap-2'
									}
									key={i}
								>
									<div
										className={
											i % 2 === 0
												? 'is-user:dark flex max-w-[80%] flex-col gap-2 overflow-hidden rounded-lg px-4 py-3 text-sm group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground'
												: 'is-assistant:dark flex max-w-[80%] flex-col gap-2 overflow-hidden rounded-lg px-4 py-3 text-sm group-[.is-assistant]:bg-secondary group-[.is-assistant]:text-foreground'
										}
									>
										<Skeleton className="mb-2 h-22 w-64" />
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Input area (matches PromptInput container) */}
				<div className="mt-4 h-min border-border border-t p-4">
					<div className="flex items-center gap-3">
						<Skeleton className="h-10 flex-1 rounded" />
						<Skeleton className="h-10 w-10 rounded" />
					</div>
				</div>
			</div>
		</div>
	);
}
