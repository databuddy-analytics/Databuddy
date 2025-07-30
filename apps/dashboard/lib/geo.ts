import { useQuery } from '@tanstack/react-query';

const countriesGeoUrl = '/countries.json';
const subdivisionsGeoUrl = '/subdivisions.json';

export type Subdivisions = {
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
			coordinates: any[][][];
		};
	}>;
};

export type Country = {
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
			coordinates: any[][][];
		};
	}>;
};

export const useSubdivisions = () => {
	return useQuery<Subdivisions>({
		queryKey: ['subdivisions'],
		queryFn: () => fetch(subdivisionsGeoUrl).then((res) => res.json()),
	});
};

export const useCountries = () => {
	return useQuery<Country>({
		queryKey: ['countries'],
		queryFn: () => fetch(countriesGeoUrl).then((res) => res.json()),
	});
};

export const useGetRegionName = () => {
	const { data: subdivisions } = useSubdivisions();

	return {
		getRegionName: (region: string) => {
			return subdivisions?.features.find(
				(feature) => feature.properties.iso_3166_2 === region
			)?.properties.name;
		},
	};
};
