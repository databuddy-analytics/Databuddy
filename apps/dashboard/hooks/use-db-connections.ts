'use client';

import { authClient } from '@databuddy/auth/client';
import type { AppRouter } from '@databuddy/rpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/lib/trpc';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type DbConnection = RouterOutput['dbConnections']['list'][number];
export type CreateDbConnectionData = RouterInput['dbConnections']['create'];
export type UpdateDbConnectionData = RouterInput['dbConnections']['update'];

export function useDbConnections() {
	const { data: activeOrganization, isPending: isLoadingOrganization } =
		authClient.useActiveOrganization();

	const { data, isLoading, isError, error, refetch, isFetching } =
		trpc.dbConnections.list.useQuery(
			{ organizationId: activeOrganization?.id },
			{ enabled: !isLoadingOrganization }
		);

	return {
		connections: data || [],
		isLoading: isLoading || isLoadingOrganization,
		isFetching,
		isError,
		error,
		refetch,
	};
}

export function useDbConnection(id: string) {
	return trpc.dbConnections.getById.useQuery({ id }, { enabled: !!id });
}

export function useCreateDbConnection({
	onSuccess,
	onError,
}: {
	onSuccess?: () => void;
	onError?: (errorMessage: string) => void;
}) {
	const utils = trpc.useUtils();
	return trpc.dbConnections.create.useMutation({
		onSuccess: (newConnection, variables) => {
			const queryKey = {
				organizationId: variables.organizationId ?? undefined,
			};

			utils.dbConnections.list.setData(queryKey, (old) => {
				if (!old) {
					return [newConnection];
				}
				const exists = old.some((c) => c.id === newConnection.id);
				return exists ? old : [...old, newConnection];
			});
			onSuccess?.();
		},
		onError: (error) => {
			console.error('Failed to create database connection:', error);
			onError?.(error.message);
		},
	});
}

export function useUpdateDbConnection({
	onSuccess,
	onError,
}: {
	onSuccess?: () => void;
	onError?: (errorMessage: string) => void;
} = {}) {
	const utils = trpc.useUtils();
	return trpc.dbConnections.update.useMutation({
		onSuccess: (updatedConnection) => {
			const getByIdKey = { id: updatedConnection.id };
			const listKey = {
				organizationId: updatedConnection.organizationId ?? undefined,
			};

			utils.dbConnections.list.setData(listKey, (old) => {
				if (!old) {
					return old;
				}
				return old.map((connection) =>
					connection.id === updatedConnection.id
						? updatedConnection
						: connection
				);
			});

			utils.dbConnections.getById.setData(getByIdKey, updatedConnection);
			onSuccess?.();
		},
		onError: (error) => {
			console.error('Failed to update database connection:', error);
			onError?.(error.message);
		},
	});
}

export function useDeleteDbConnection({
	onSuccess,
	onError,
}: {
	onSuccess?: () => void;
	onError?: (errorMessage: string) => void;
}) {
	const utils = trpc.useUtils();
	return trpc.dbConnections.delete.useMutation({
		onMutate: async ({ id }) => {
			const getByIdKey = { id };
			const previousConnection =
				utils.dbConnections.getById.getData(getByIdKey);

			const listKey = {
				organizationId: previousConnection?.organizationId ?? undefined,
			};

			await utils.dbConnections.list.cancel(listKey);
			const previousData = utils.dbConnections.list.getData(listKey);

			utils.dbConnections.list.setData(listKey, (old) => {
				if (!old) {
					return old;
				}
				return old.filter((c) => c.id !== id);
			});

			return { previousData, listKey };
		},
		onError: (error, __, context) => {
			if (context?.previousData && context.listKey) {
				utils.dbConnections.list.setData(context.listKey, context.previousData);
			}
			onError?.(error.message);
		},
		onSuccess: (_, { id }) => {
			utils.dbConnections.getById.setData({ id }, undefined);
			onSuccess?.();
		},
	});
}
