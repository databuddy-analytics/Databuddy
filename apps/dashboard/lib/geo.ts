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

export const useCountries = () =>
	useQuery<Country>({
		queryKey: ["countries"],
		queryFn: () => fetch(countriesGeoUrl).then((res) => res.json()),
	});
