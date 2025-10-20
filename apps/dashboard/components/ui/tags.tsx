'use client';

import { PlusIcon, XCircleIcon } from '@phosphor-icons/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface TagsChatProps {
	values: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
	suggestions?: string[];
	maxTags?: number;
	allowDuplicates?: boolean;
	className?: string;
}

function normalizeTag(raw: string): string {
	return raw.trim();
}

export function TagsChat({
	values,
	onChange,
	placeholder = 'Type a tag and press Enter…',
	suggestions,
	maxTags,
	allowDuplicates = false,
	className,
}: TagsChatProps) {
	const [draft, setDraft] = useState('');
	const areaRef = useRef<HTMLDivElement>(null);

	const canAddMore =
		typeof maxTags === 'number' ? values.length < maxTags : true;

	const addTag = useCallback(
		(tag: string) => {
			const normalized = normalizeTag(tag);
			if (!normalized) {
				return;
			}
			if (!allowDuplicates && values.some((t) => t === normalized)) {
				setDraft('');
				return;
			}
			if (!canAddMore) {
				return;
			}
			onChange([...values, normalized]);
			setDraft('');
			// Scroll to bottom like chat
			queueMicrotask(() => {
				areaRef.current?.scrollTo({
					top: areaRef.current.scrollHeight,
					behavior: 'smooth',
				});
			});
		},
		[allowDuplicates, canAddMore, onChange, values]
	);

	const removeTag = useCallback(
		(index: number) => {
			const next = values.slice();
			next.splice(index, 1);
			onChange(next);
		},
		[onChange, values]
	);

	const visibleSuggestions = useMemo(() => {
		if (!suggestions || suggestions.length === 0) {
			return [] as string[];
		}
		const needle = draft.toLowerCase();
		const pool = suggestions.filter((s) => s.toLowerCase().includes(needle));
		return pool.slice(0, 6);
	}, [draft, suggestions]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTag(draft);
		}
		if (e.key === 'Backspace' && draft.length === 0 && values.length > 0) {
			e.preventDefault();
			removeTag(values.length - 1);
		}
	};

	return (
		<div className={cn('rounded border bg-background', className)}>
			<div className="max-h-56 overflow-auto p-3" ref={areaRef}>
				{values.length === 0 ? (
					<div className="text-muted-foreground text-sm">
						No tags yet. Start typing below.
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						{values.map((tag, index) => (
							<div
								className="group relative inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-foreground text-sm"
								key={`${tag}-${index}`}
							>
								<span className="max-w-32 truncate">{tag}</span>
								<Button
									aria-label={`Remove tag ${tag}`}
									className="h-4 w-4 p-0 opacity-60 hover:opacity-100"
									onClick={() => removeTag(index)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<XCircleIcon className="h-3 w-3" weight="duotone" />
								</Button>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="border-t p-3">
				<div className="flex items-center gap-2">
					<Input
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						value={draft}
					/>
					<Button
						disabled={!canAddMore || normalizeTag(draft).length === 0}
						onClick={() => addTag(draft)}
						type="button"
					>
						<PlusIcon className="mr-2 h-4 w-4" /> Add
					</Button>
				</div>

				{visibleSuggestions.length > 0 && (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{visibleSuggestions.map((s) => (
							<button
								className="rounded border px-2 py-0.5 text-muted-foreground text-xs hover:border-primary/50 hover:text-foreground"
								key={s}
								onClick={(e) => {
									e.preventDefault();
									addTag(s);
								}}
								type="button"
							>
								{s}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
