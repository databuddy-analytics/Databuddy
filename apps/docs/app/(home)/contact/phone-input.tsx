"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import type { Country } from "react-phone-number-input";
import { getCountries, getCountryCallingCode } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import PhoneInputPrimitive from "react-phone-number-input/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const POPULAR_COUNTRIES: Country[] = [
	"US",
	"GB",
	"CA",
	"AU",
	"DE",
	"FR",
	"IN",
	"BR",
];

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function getCountryName(code: Country): string {
	return countryNames.of(code) ?? code;
}

interface PhoneInputProps {
	error?: boolean;
	id?: string;
	onChangeAction: (value: string) => void;
	value: string;
}

export function PhoneInput({
	value,
	onChangeAction,
	error,
	id,
}: PhoneInputProps) {
	const [country, setCountry] = useState<Country>("US");
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);

	const allCountries = useMemo(() => getCountries(), []);

	const filtered = useMemo(() => {
		if (!search.trim()) {
			return allCountries;
		}
		const q = search.toLowerCase();
		return allCountries.filter((c) => {
			const name = getCountryName(c).toLowerCase();
			const dialCode = `+${getCountryCallingCode(c)}`;
			return (
				name.includes(q) || dialCode.includes(q) || c.toLowerCase().includes(q)
			);
		});
	}, [allCountries, search]);

	const selectCountry = (c: Country) => {
		setCountry(c);
		setOpen(false);
		setSearch("");
	};

	const FlagComponent = flags[country];

	return (
		<div className="flex">
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<button
						aria-label="Select country code"
						className={cn(
							"flex h-9 shrink-0 items-center gap-1.5 rounded rounded-r-none border border-input border-r-0 bg-transparent px-2.5 text-sm",
							"hover:bg-accent/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
							"dark:bg-input/30",
							error && "border-destructive"
						)}
						type="button"
					>
						{FlagComponent ? (
							<span className="flex size-4 items-center overflow-hidden rounded-sm">
								<FlagComponent title={getCountryName(country)} />
							</span>
						) : null}
						<span className="text-muted-foreground text-xs tabular-nums">
							+{getCountryCallingCode(country)}
						</span>
						<CaretDownIcon
							className="size-3 text-muted-foreground"
							weight="fill"
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-60 p-0"
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						searchRef.current?.focus();
					}}
				>
					<div className="border-b px-3 py-2">
						<input
							className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search countries..."
							ref={searchRef}
							value={search}
						/>
					</div>
					<div className="max-h-60 overflow-y-auto p-1">
						{search.trim() ? null : (
							<>
								{POPULAR_COUNTRIES.map((c) => (
									<CountryRow
										countryCode={c}
										key={`pop-${c}`}
										onSelectAction={() => selectCountry(c)}
										selected={country === c}
									/>
								))}
								<div className="mx-2 my-1 h-px bg-border" />
							</>
						)}
						{filtered.length > 0 ? (
							filtered.map((c) => (
								<CountryRow
									countryCode={c}
									key={c}
									onSelectAction={() => selectCountry(c)}
									selected={country === c}
								/>
							))
						) : (
							<p className="py-4 text-center text-muted-foreground text-sm">
								No countries found
							</p>
						)}
					</div>
				</PopoverContent>
			</Popover>
			<PhoneInputPrimitive
				autoComplete="off"
				className={cn(
					"flex h-9 w-full min-w-0 rounded rounded-l-none border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm",
					"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
					error &&
						"border-destructive ring-destructive/20 dark:ring-destructive/40",
					"dark:bg-input/30"
				)}
				country={country}
				id={id}
				onChange={(val) => onChangeAction(val ?? "")}
				placeholder="(555) 123-4567"
				value={value || undefined}
			/>
		</div>
	);
}

function CountryRow({
	countryCode,
	selected,
	onSelectAction,
}: {
	countryCode: Country;
	selected: boolean;
	onSelectAction: () => void;
}) {
	const FlagComp = flags[countryCode];
	return (
		<button
			className={cn(
				"flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm",
				"hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
				selected && "bg-accent/50"
			)}
			onClick={onSelectAction}
			type="button"
		>
			{FlagComp ? (
				<span className="flex size-4 items-center overflow-hidden rounded-sm">
					<FlagComp title={getCountryName(countryCode)} />
				</span>
			) : null}
			<span className="flex-1 truncate">{getCountryName(countryCode)}</span>
			<span className="text-muted-foreground text-xs tabular-nums">
				+{getCountryCallingCode(countryCode)}
			</span>
		</button>
	);
}
