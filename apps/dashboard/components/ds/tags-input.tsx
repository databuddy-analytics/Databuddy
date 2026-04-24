"use client";

import { useFieldContext } from "@/components/ds/field";
import { cn } from "@/lib/utils";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useId, useState, type KeyboardEvent } from "react";

interface TagsInputProps {
	className?: string;
	disabled?: boolean;
	id?: string;
	onChange: (values: string[]) => void;
	placeholder?: string;
	validate?: (value: string) => { error?: string; success: boolean };
	values: string[];
}

export function TagsInput({
	values,
	onChange,
	placeholder,
	validate,
	className,
	disabled,
	id,
}: TagsInputProps) {
	const field = useFieldContext();
	const fallbackId = useId();
	const inputId = id ?? field?.id ?? fallbackId;

	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const localErrorId = `${inputId}-error`;
	const describedBy = [
		field?.error ? field.errorId : null,
		error ? localErrorId : null,
		field?.descriptionId,
	]
		.filter(Boolean)
		.join(" ");

	const addValue = (val: string) => {
		const trimmed = val.trim();
		if (!trimmed || values.includes(trimmed)) {
			setDraft("");
			setError(null);
			return;
		}

		if (validate) {
			const result = validate(trimmed);
			if (!result.success) {
				setError(result.error ?? "Invalid value");
				return;
			}
		}

		onChange([...values, trimmed]);
		setDraft("");
		setError(null);
	};

	const removeValue = (index: number) => {
		onChange(values.filter((_, i) => i !== index));
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			addValue(draft);
		} else if (e.key === "Backspace" && !draft && values.length > 0) {
			e.preventDefault();
			removeValue(values.length - 1);
			setError(null);
		}
	};

	const handleBlur = () => {
		if (draft.trim()) {
			addValue(draft);
		}
	};

	const hasError = !!error || field?.error;

	return (
		<div className={cn("space-y-1", className)}>
			<div
				className={cn(
					"flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md bg-secondary px-2 py-1",
					"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"focus-within:ring-2 focus-within:ring-ring/60",
					hasError &&
						"ring-2 ring-destructive/60 focus-within:ring-destructive/60",
					disabled && "cursor-not-allowed opacity-50"
				)}
			>
				{values.map((val, i) => (
					<span
						className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-foreground text-xs shadow-xs"
						key={`${val}-${i}`}
					>
						{val}
						{!disabled && (
							<button
								aria-label={`Remove ${val}`}
								className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
								onClick={() => removeValue(i)}
								type="button"
							>
								<X className="size-3" />
							</button>
						)}
					</span>
				))}
				<input
					aria-describedby={describedBy || undefined}
					aria-invalid={hasError || undefined}
					className="min-w-24 flex-1 bg-transparent py-0.5 text-foreground text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
					disabled={disabled}
					id={inputId}
					onBlur={handleBlur}
					onChange={(e) => {
						setDraft(e.target.value);
						if (error) {
							setError(null);
						}
					}}
					onKeyDown={handleKeyDown}
					placeholder={values.length === 0 ? placeholder : "Add more…"}
					type="text"
					value={draft}
				/>
			</div>
			{error ? (
				<p className="text-destructive text-xs" id={localErrorId} role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
