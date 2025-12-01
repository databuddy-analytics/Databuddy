"use client";

import type { InferSelectModel, websites } from "@databuddy/db";
import type { ProcessedMiniChartData } from "@databuddy/shared/types/website";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export type Website = InferSelectModel<typeof websites>;
export type WebsitesListData = {
	websites: Website[];
	chartData: Record<string, ProcessedMiniChartData>;
	activeUsers: Record<string, number>;
};

export const getWebsiteByIdKey = (id: string): QueryKey =>
	orpc.websites.getById.queryKey({ input: { id } });

export const getWebsitesListKey = (organizationId?: string): QueryKey =>
	orpc.websites.listWithCharts.queryKey({
		input: { organizationId },
	});

export const updateWebsiteInList = (
	old: WebsitesListData | undefined,
	updatedWebsite: Website
): WebsitesListData | undefined => {
	if (!old) {
		return old;
	}
	return {
		...old,
		websites: old.websites.map((website) =>
			website.id === updatedWebsite.id ? updatedWebsite : website
		),
	};
};

const addWebsiteToList = (
	old: WebsitesListData | undefined,
	newWebsite: Website
): WebsitesListData => {
	if (!old) {
		return { websites: [newWebsite], chartData: {}, activeUsers: {} };
	}
	if (old.websites.some((w) => w.id === newWebsite.id)) {
		return old;
	}
	return {
		websites: [...old.websites, newWebsite],
		chartData: {
			...old.chartData,
			[newWebsite.id]: { data: [], totalViews: 0, trend: null },
		},
		activeUsers: {
			...old.activeUsers,
			[newWebsite.id]: 0,
		},
	};
};

const removeWebsiteFromList = (
	old: WebsitesListData | undefined,
	websiteId: string
): WebsitesListData | undefined => {
	if (!old) {
		return old;
	}
	return {
		...old,
		websites: old.websites.filter((w) => w.id !== websiteId),
		chartData: Object.fromEntries(
			Object.entries(old.chartData).filter(([key]) => key !== websiteId)
		),
		activeUsers: Object.fromEntries(
			Object.entries(old.activeUsers).filter(([key]) => key !== websiteId)
		),
	};
};

export function useWebsites() {
	const { activeOrganization, isLoading: isLoadingOrganization } =
		useOrganizationsContext();

	const query = useQuery({
		...orpc.websites.listWithCharts.queryOptions({
			input: { organizationId: activeOrganization?.id },
		}),
		enabled: !isLoadingOrganization,
	});

	return {
		websites: query.data?.websites ?? [],
		chartData: query.data?.chartData,
		activeUsers: query.data?.activeUsers,
		isLoading: query.isLoading || isLoadingOrganization,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export function useWebsite(id: string) {
	return useQuery({
		...orpc.websites.getById.queryOptions({
			input: { id },
		}),
		enabled: !!id,
	});
}

export function useCreateWebsite() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.websites.create.mutationOptions(),
		onSuccess: (newWebsite: Website, variables) => {
			const listKey = getWebsitesListKey(variables.organizationId ?? undefined);
			queryClient.setQueryData<WebsitesListData>(listKey, (old) =>
				addWebsiteToList(old, newWebsite)
			);
		},
		onError: (error) => {
			console.error("Failed to create website:", error);
		},
	});
}

export const updateWebsiteCache = (
	queryClient: ReturnType<typeof useQueryClient>,
	updatedWebsite: Website
) => {
	const getByIdKey = getWebsiteByIdKey(updatedWebsite.id);
	const listKey = getWebsitesListKey(
		updatedWebsite.organizationId ?? undefined
	);

	queryClient.setQueryData<WebsitesListData>(listKey, (old) =>
		updateWebsiteInList(old, updatedWebsite)
	);
	queryClient.setQueryData(getByIdKey, updatedWebsite);
};

export function useUpdateWebsite() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.websites.update.mutationOptions(),
		onSuccess: (updatedWebsite: Website) => {
			updateWebsiteCache(queryClient, updatedWebsite);
		},
		onError: (error) => {
			console.error("Failed to update website:", error);
		},
	});
}

export function useDeleteWebsite() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.websites.delete.mutationOptions(),
		onMutate: async ({ id }) => {
			const getByIdKey = getWebsiteByIdKey(id);
			const previousWebsite = queryClient.getQueryData<Website>(getByIdKey);

			const listKey = getWebsitesListKey(
				previousWebsite?.organizationId ?? undefined
			);

			await queryClient.cancelQueries({ queryKey: listKey });
			const previousData = queryClient.getQueryData<WebsitesListData>(listKey);

			queryClient.setQueryData<WebsitesListData>(listKey, (old) =>
				removeWebsiteFromList(old, id)
			);

			return { previousData, listKey };
		},
		onError: (_error, _variables, context) => {
			if (context?.previousData && context.listKey) {
				queryClient.setQueryData(context.listKey, context.previousData);
			}
		},
		onSuccess: (_data, { id }) => {
			const getByIdKey = getWebsiteByIdKey(id);
			queryClient.setQueryData(getByIdKey, undefined);
		},
	});
}
