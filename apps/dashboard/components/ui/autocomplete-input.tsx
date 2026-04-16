"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

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
		const [isOpen, setIsOpen] = useState(false);
		const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>(
			[]
		);
		const [prevValue, setPrevValue] = useState(value);
		const [localValue, setLocalValue] = useState(value);
		const containerRef = useRef<HTMLDivElement>(null);
		const onValueChangeRef = useRef(onValueChange);

		onValueChangeRef.current = onValueChange;

		if (prevValue !== value) {
			setPrevValue(value);
			setLocalValue(value);
		}

		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				if (
					containerRef.current &&
					!containerRef.current.contains(event.target as Node)
				) {
					setIsOpen(false);
				}
			};

			if (isOpen) {
				document.addEventListener("mousedown", handleClickOutside);
				return () =>
					document.removeEventListener("mousedown", handleClickOutside);
			}
		}, [isOpen]);

		const handleInputChange = (newValue: string) => {
			setLocalValue(newValue);
			onValueChangeRef.current(newValue);

			if (newValue.trim()) {
				const filtered = suggestions
					.filter((s) => s.toLowerCase().includes(newValue.toLowerCase()))
					.slice(0, 8);
				setFilteredSuggestions(filtered);
				setIsOpen(filtered.length > 0);
			} else {
				setFilteredSuggestions(suggestions.slice(0, 8));
				setIsOpen(suggestions.length > 0);
			}
		};

		const handleFocus = () => {
			if (localValue.trim()) {
				const filtered = suggestions
					.filter((s) => s.toLowerCase().includes(localValue.toLowerCase()))
					.slice(0, 8);
				setFilteredSuggestions(filtered);
				setIsOpen(filtered.length > 0);
			} else {
				setFilteredSuggestions(suggestions.slice(0, 8));
				setIsOpen(suggestions.length > 0);
			}
		};

		const handleSelect = (suggestion: string) => {
			setLocalValue(suggestion);
			onValueChangeRef.current(suggestion);
			setIsOpen(false);
		};

		return (
			<div className={`relative ${className || ""}`} ref={containerRef}>
				<Input
					className={inputClassName}
					onChange={(e) => handleInputChange(e.target.value)}
					onFocus={handleFocus}
					placeholder={placeholder}
					value={localValue}
				/>
				{isOpen && filteredSuggestions.length > 0 && (
					<div className="absolute z-50 mt-1 max-h-48 w-full min-w-[200px] overflow-y-auto rounded border bg-popover shadow-lg">
						{filteredSuggestions.map((suggestion) => (
							<button
								className="wrap-break-words w-full cursor-pointer border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent hover:text-accent-foreground"
								key={suggestion}
								onClick={() => handleSelect(suggestion)}
								type="button"
							>
								{suggestion}
							</button>
						))}
					</div>
				)}
			</div>
		);
	}
);

AutocompleteInput.displayName = "AutocompleteInput";
