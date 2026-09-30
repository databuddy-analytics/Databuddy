import { useQuery } from "@tanstack/react-query";

const countriesGeoUrl = "https://cdn.databuddy.cc/geojson/countries.geojson";

export interface Country {
	features: Array<{
		type: string;
		properties: {
			ISO_A2: string;
			ADMIN: string;
			ISO_A3: string;
			BORDER: number;
		};
		geometry: {
			type: string;
			coordinates: number[][][];
		};
	}>;
	type: string;
}

// Natural Earth leaves ISO_A2 as "-99" for a few countries with disputed territory.
const ISO_A2_BY_ADMIN: Record<string, string> = { France: "FR", Norway: "NO" };

/** The ISO 3166 alpha-2 code the API reports for a GeoJSON country feature. */
export function featureCountryCode(
	properties: { ADMIN?: string; ISO_A2?: string } | null | undefined
): string {
	const code = properties?.ISO_A2?.toUpperCase() ?? "";
	if (code === "-99") {
		return ISO_A2_BY_ADMIN[properties?.ADMIN ?? ""] ?? "";
	}
	return code === "CN-TW" ? "TW" : code;
}

export const useCountries = () =>
	useQuery<Country>({
		queryKey: ["countries"],
		queryFn: () => fetch(countriesGeoUrl).then((res) => res.json()),
	});
