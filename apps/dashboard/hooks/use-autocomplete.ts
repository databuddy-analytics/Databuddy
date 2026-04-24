import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export interface AutocompleteData {
	browsers: string[];
	countries: string[];
	customEvents: string[];
	deviceTypes: string[];
	operatingSystems: string[];
	pagePaths: string[];
	utmCampaigns: string[];
	utmMediums: string[];
	utmSources: string[];
}

export function useAutocompleteData(websiteId: string, enabled = true) {
	return useQuery({
		...orpc.autocomplete.get.queryOptions({
			input: { websiteId },
		}),
		enabled: enabled && !!websiteId,
	});
}
