"use client";

import { Autocomplete } from "@/components/ds/autocomplete";
import { memo, useMemo, useState } from "react";

interface AutocompleteInputProps {
	className?: string;
	inputClassName?: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	suggestions: string[];
	value: string;
}

export const AutocompleteInput = memo(
	({
		value,
		onValueChange,
		suggestions,
		placeholder,
		className,
		inputClassName,
	}: AutocompleteInputProps) => {
		const [open, setOpen] = useState(false);

		const filtered = useMemo(() => {
			const query = value.trim().toLowerCase();
			if (!query) {
				return suggestions;
			}
			return suggestions.filter((s) => s.toLowerCase().includes(query));
		}, [suggestions, value]);

		return (
			<Autocomplete
				items={filtered}
				mode="none"
				onOpenChange={(next) => setOpen(next)}
				onValueChange={(next) => onValueChange(next)}
				open={open}
				value={value}
			>
				<div className={className}>
					<Autocomplete.Input
						className={inputClassName}
						onFocus={() => setOpen(true)}
						placeholder={placeholder}
					/>
				</div>
				{filtered.length > 0 && (
					<Autocomplete.Content>
						{filtered.map((suggestion) => (
							<Autocomplete.Item key={suggestion} value={suggestion}>
								{suggestion}
							</Autocomplete.Item>
						))}
					</Autocomplete.Content>
				)}
			</Autocomplete>
		);
	}
);

AutocompleteInput.displayName = "AutocompleteInput";
