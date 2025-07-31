'use client';

import { authClient } from '@databuddy/auth/client';
import type { AppRouter } from '@databuddy/rpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/lib/trpc';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type Website = RouterOutput['websites']['list'][number];
export type CreateWebsiteData = RouterInput['websites']['create'];
export type UpdateWebsiteData = RouterInput['websites']['update'];

export function useWebsites() {
	const { data: activeOrganization, isPending: isLoadingOrganization } =
		authClient.useActiveOrganization();

	const { data, isLoading, isError, refetch } =
		trpc.websites.listWithCharts.useQuery(
			{ organizationId: activeOrganization?.id },
			{ enabled: !isLoadingOrganization }
		);

	return {
		websites: data?.websites || [],
		chartData: data?.chartData,
		isLoading: isLoading || isLoadingOrganization,
		isError,
		refetch,
	};
}

export function useWebsite(id: string) {
	return trpc.websites.getById.useQuery({ id }, { enabled: !!id });
}

export function useCreateWebsite() {
	const utils = trpc.useUtils();
	return trpc.websites.create.useMutation({
		onSuccess: (newWebsite, variables) => {
			const queryKey = {
				organizationId: variables.organizationId ?? undefined,
			};

			utils.websites.listWithCharts.setData(queryKey, (old) => {
				if (!old) return { websites: [newWebsite], chartData: {} };
				const exists = old.websites.some((w) => w.id === newWebsite.id);
				return exists
					? old
					: {
							websites: [...old.websites, newWebsite],
							chartData: {
								...old.chartData,
								[newWebsite.id]: { data: [], totalViews: 0, trend: null },
							},
						};
			});
		},
		onError: (error) => {
			console.error('Failed to create website:', error);
		},
	});
}

export function useUpdateWebsite() {
	const utils = trpc.useUtils();
	return trpc.websites.update.useMutation({
		onSuccess: (updatedWebsite) => {
			const getByIdKey = { id: updatedWebsite.id };
			const listKey = {
				organizationId: updatedWebsite.organizationId ?? undefined,
			};

			utils.websites.listWithCharts.setData(listKey, (old) => {
				if (!old) return old;
				return {
					...old,
					websites: old.websites.map((website) =>
						website.id === updatedWebsite.id ? updatedWebsite : website
					),
				};
			});

			utils.websites.getById.setData(getByIdKey, updatedWebsite);
		},
		onError: (error) => {
			console.error('Failed to update website:', error);
		},
	});
}

export function useDeleteWebsite() {
	const utils = trpc.useUtils();
	return trpc.websites.delete.useMutation({
		onMutate: async ({ id }) => {
			const getByIdKey = { id };
			const previousWebsite = utils.websites.getById.getData(getByIdKey);

			const listKey = {
				organizationId: previousWebsite?.organizationId ?? undefined,
			};

			await utils.websites.listWithCharts.cancel(listKey);
			const previousData = utils.websites.listWithCharts.getData(listKey);

			utils.websites.listWithCharts.setData(listKey, (old) => {
				if (!old) return old;
				return {
					...old,
					websites: old.websites.filter((w) => w.id !== id),
					chartData: Object.fromEntries(
						Object.entries(old.chartData).filter(([key]) => key !== id)
					),
				};
			});

			return { previousData, listKey };
		},
		onError: (_, __, context) => {
			if (context?.previousData && context.listKey) {
				utils.websites.listWithCharts.setData(
					context.listKey,
					context.previousData
				);
			}
		},
		onSuccess: (_, { id }) => {
			utils.websites.getById.setData({ id }, undefined);
		},
	});
}
