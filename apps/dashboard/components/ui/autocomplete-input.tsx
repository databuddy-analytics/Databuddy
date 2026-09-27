"use client";

import { memo, useMemo, useState } from "react";
import { Autocomplete } from "@databuddy/ui/client";

interface AutocompleteInputProps {
	className?: string;
	disabled?: boolean;
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
		disabled,
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
				disabled={disabled}
				items={filtered}
				mode="none"
				onOpenChange={(next) => setOpen(next)}
				onValueChange={(next) => onValueChange(next)}
				open={open && !disabled}
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
