"use client";

import { useMemo } from "react";

interface CountryFlagProps {
	country: string;
	size?: number;
}

export function CountryFlag({ country, size = 18 }: CountryFlagProps) {
	const countryCode = country.toLowerCase();

	const imageUrl = useMemo(
		() =>
			`https://purecatamphetamine.github.io/country-flag-icons/3x2/${countryCode.toUpperCase()}.svg`,
		[countryCode]
	);

	return (
		<img
			alt={`${country} flag`}
			className="inline-block rounded-sm object-cover"
			height={size * 0.75}
			src={imageUrl}
			style={{ aspectRatio: "4/3" }}
			width={size}
		/>
	);
}
