'use client';

import { CaretDownIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useSearchContext } from 'fumadocs-ui/provider';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { AsideLink } from '@/components/ui/aside-link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { contents } from './sidebar-content';

export default function CustomSidebar() {
	const [currentOpen, setCurrentOpen] = useState<number>(0);
	const pathname = usePathname();
	const { setOpenSearch } = useSearchContext();

	const getDefaultValue = useCallback(() => {
		const defaultValue = contents.findIndex((item) =>
			item.list.some((listItem) => listItem.href === pathname)
		);
		return defaultValue === -1 ? 0 : defaultValue;
	}, [pathname]);

	useEffect(() => {
		setCurrentOpen(getDefaultValue());
	}, [getDefaultValue]);

	const handleSearch = () => {
		setOpenSearch(true);
	};

	return (
		<div className="fixed top-16 left-0 z-30 hidden h-[calc(100vh-4rem)] md:block">
			<aside className="flex h-full w-[268px] flex-col overflow-y-auto border-border border-t border-r bg-background lg:w-[286px]">
				<div className="flex h-full flex-col">
					<button
						className="flex w-full items-center justify-start gap-3 border-border border-b px-5 py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						onClick={handleSearch}
						type="button"
					>
						<MagnifyingGlassIcon
							className="size-4 flex-shrink-0"
							weight="duotone"
						/>
						<span className="text-sm">Search documentation...</span>
					</button>

					<MotionConfig
						transition={{ duration: 0.4, type: 'spring', bounce: 0 }}
					>
						<div className="flex flex-col">
							{contents.map((item, index) => (
								<div key={item.title}>
									<button
										className="flex w-full items-center gap-3 border-border border-b px-5 py-2.5 text-left font-medium text-foreground text-sm transition-colors hover:bg-muted/50"
										onClick={() => {
											if (currentOpen === index) {
												setCurrentOpen(-1);
											} else {
												setCurrentOpen(index);
											}
										}}
										type="button"
									>
										<item.Icon
											className="size-5 flex-shrink-0 text-foreground"
											weight="fill"
										/>
										<span className="flex-1 text-sm">{item.title}</span>
										{item.isNew && <NewBadge />}
										<motion.div
											animate={{ rotate: currentOpen === index ? 180 : 0 }}
											className="flex-shrink-0"
										>
											<CaretDownIcon
												className="h-4 w-4 text-muted-foreground"
												weight="duotone"
											/>
										</motion.div>
									</button>
									<AnimatePresence initial={false}>
										{currentOpen === index && (
											<motion.div
												animate={{ opacity: 1, height: 'auto' }}
												className="relative overflow-hidden"
												exit={{ opacity: 0, height: 0 }}
												initial={{ opacity: 0, height: 0 }}
											>
												<motion.div className="text-sm">
													{item.list.map((listItem) => (
														<div key={listItem.title}>
															<Suspense fallback={<>Loading...</>}>
																{listItem.group ? (
																	<div className="mx-5 my-1 flex flex-row items-center gap-2">
																		<p className="bg-gradient-to-tr from-gray-900 to-stone-900 bg-clip-text text-sm text-transparent dark:from-gray-100 dark:to-stone-200">
																			{listItem.title}
																		</p>
																		<div className="h-px flex-grow bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
																	</div>
																) : (
																	<AsideLink
																		activeClassName="!bg-muted !text-foreground font-medium"
																		className="flex items-center gap-3 px-6 py-2 text-muted-foreground text-sm transition-colors hover:bg-muted/50 hover:text-foreground"
																		href={listItem.href || '#'}
																		startWith="/docs"
																		title={listItem.title}
																	>
																		<listItem.icon
																			className="size-5 flex-shrink-0"
																			weight="duotone"
																		/>
																		<span className="flex-1">
																			{listItem.title}
																		</span>
																		{listItem.isNew && <NewBadge />}
																	</AsideLink>
																)}
															</Suspense>
														</div>
													))}
												</motion.div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							))}
						</div>
					</MotionConfig>
				</div>
			</aside>
		</div>
	);
}

function NewBadge({ isSelected }: { isSelected?: boolean }) {
	return (
		<div className="flex w-full items-center justify-end">
			<Badge
				className={cn(
					' !no-underline !decoration-transparent pointer-events-none border-dashed',
					isSelected && '!border-solid'
				)}
				variant={isSelected ? 'default' : 'outline'}
			>
				New
			</Badge>
		</div>
	);
}
