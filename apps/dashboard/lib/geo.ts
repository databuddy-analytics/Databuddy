import { useQuery } from "@tanstack/react-query";

const countriesGeoUrl = "/api/geo-proxy?path=/geojson/countries.geojson";
const subdivisionsGeoUrl = "/api/geo-proxy?path=/geojson/subdivisions.json";

export interface Subdivisions {
	type: string;
	features: Array<{
		type: string;
		properties: {
			name: string;
			iso_3166_2: string;
			admin: string;
			border: number;
		};
		geometry: {
			type: string;
			coordinates: number[][][];
		};
	}>;
}

export interface Country {
	type: string;
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
}

export const useSubdivisions = () =>
	useQuery<Subdivisions>({
		queryKey: ["subdivisions"],
		queryFn: () => fetch(subdivisionsGeoUrl).then((res) => res.json()),
	});

export const useCountries = () =>
	useQuery<Country>({
		queryKey: ["countries"],
		queryFn: () => fetch(countriesGeoUrl).then((res) => res.json()),
	});

export const useGetRegionName = () => {
	const { data: subdivisions } = useSubdivisions();

	return {
		getRegionName: (region: string) =>
			subdivisions?.features.find(
				(feature) => feature.properties.iso_3166_2 === region
			)?.properties.name,
	};
};
