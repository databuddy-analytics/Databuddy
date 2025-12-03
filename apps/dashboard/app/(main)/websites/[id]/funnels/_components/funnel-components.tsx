"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export const AutocompleteInput = memo(
	({
		value,
		onValueChange,
		suggestions,
		placeholder,
		className,
		inputClassName,
	}: {
		value: string;
		onValueChange: (value: string) => void;
		suggestions: string[];
		placeholder?: string;
		className?: string;
		inputClassName?: string;
	}) => {
		const [isOpen, setIsOpen] = useState(false);
		const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>(
			[]
		);
		const containerRef = useRef<HTMLDivElement>(null);

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
			onValueChange(newValue);

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
			if (value.trim()) {
				const filtered = suggestions
					.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
					.slice(0, 8);
				setFilteredSuggestions(filtered);
				setIsOpen(filtered.length > 0);
			} else {
				setFilteredSuggestions(suggestions.slice(0, 8));
				setIsOpen(suggestions.length > 0);
			}
		};

		const handleSelect = (suggestion: string) => {
			onValueChange(suggestion);
			setIsOpen(false);
		};

		return (
			<div className={`relative ${className || ""}`} ref={containerRef}>
				<Input
					className={inputClassName}
					onChange={(e) => handleInputChange(e.target.value)}
					onFocus={handleFocus}
					placeholder={placeholder}
					value={value || ""}
				/>
				{isOpen && filteredSuggestions.length > 0 && (
					<div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded border bg-popover shadow-lg">
						{filteredSuggestions.map((suggestion) => (
							<button
								className="w-full cursor-pointer border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent hover:text-accent-foreground"
								key={suggestion}
								onClick={() => handleSelect(suggestion)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										handleSelect(suggestion);
									}
								}}
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
