import { XIcon } from "@phosphor-icons/react/dist/ssr";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { DropdownMenu } from "@/components/ds/dropdown-menu";

interface FilterRowProps {
	field: string;
	fieldOptions: ReadonlyArray<{ label: string; value: string }>;
	onFieldChange: (value: string) => void;
	onOperatorChange: (value: string) => void;
	onRemove: () => void;
	onValueChange: (value: string) => void;
	operator: string;
	operatorOptions: ReadonlyArray<{ label: string; value: string }>;
	suggestions?: string[];
	value: string;
}

export function FilterRow({
	field,
	fieldOptions,
	onFieldChange,
	onOperatorChange,
	onRemove,
	onValueChange,
	operator,
	operatorOptions,
	suggestions = [],
	value,
}: FilterRowProps) {
	return (
		<div className="flex items-center gap-2 rounded-md border border-border/60 p-2.5">
			<DropdownMenu>
				<DropdownMenu.Trigger className="flex h-8 w-28 shrink-0 cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-3 text-foreground text-xs transition-colors hover:bg-interactive-hover">
					{fieldOptions.find((o) => o.value === field)?.label ?? field}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" side="bottom">
					<DropdownMenu.RadioGroup
						onValueChange={onFieldChange}
						value={field}
					>
						{fieldOptions.map((option) => (
							<DropdownMenu.RadioItem
								key={option.value}
								value={option.value}
							>
								{option.label}
							</DropdownMenu.RadioItem>
						))}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenu.Trigger className="flex h-8 w-24 shrink-0 cursor-pointer select-none items-center justify-between rounded-md bg-secondary px-3 text-foreground text-xs transition-colors hover:bg-interactive-hover">
					{operatorOptions.find((o) => o.value === operator)?.label ??
						operator}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" side="bottom">
					<DropdownMenu.RadioGroup
						onValueChange={onOperatorChange}
						value={operator}
					>
						{operatorOptions.map((option) => (
							<DropdownMenu.RadioItem
								key={option.value}
								value={option.value}
							>
								{option.label}
							</DropdownMenu.RadioItem>
						))}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu>

			<AutocompleteInput
				className="flex-1"
				inputClassName="h-8 text-xs"
				onValueChange={onValueChange}
				placeholder="Value"
				suggestions={suggestions}
				value={value}
			/>

			<button
				aria-label="Remove filter"
				className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
				onClick={onRemove}
				type="button"
			>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}
