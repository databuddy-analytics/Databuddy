'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export interface Experiment {
	id: string;
	websiteId: string;
	name: string;
	description?: string | null;
	status: 'draft' | 'running' | 'paused' | 'completed';
	trafficAllocation: number;
	startDate?: string | null;
	endDate?: string | null;
	primaryGoal?: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
	variants?: ExperimentVariant[];
	goals?: ExperimentGoal[];
}

export interface ExperimentVariant {
	id: string;
	experimentId: string;
	name: string;
	type: 'visual' | 'redirect' | 'code';
	content: unknown;
	trafficWeight: number;
	isControl: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface ExperimentGoal {
	id: string;
	experimentId: string;
	name: string;
	type: string;
	target: string;
	description?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateExperimentData {
	websiteId: string;
	name: string;
	description?: string;
	status?: 'draft' | 'running' | 'paused' | 'completed';
	trafficAllocation?: number;
	startDate?: string;
	endDate?: string;
	primaryGoal?: string;
	variants?: {
		name: string;
		type: 'visual' | 'redirect' | 'code';
		content: unknown;
		trafficWeight: number;
		isControl: boolean;
	}[];
	goals?: {
		name: string;
		type: string;
		target: string;
		description?: string;
	}[];
}

export interface UpdateExperimentData {
	name?: string;
	description?: string;
	status?: 'draft' | 'running' | 'paused' | 'completed';
	trafficAllocation?: number;
	startDate?: string;
	endDate?: string;
	primaryGoal?: string;
}

export function useExperiments(websiteId: string) {
	const queryClient = useQueryClient();

	const {
		data: experimentsData = [],
		isLoading,
		error,
		refetch,
	} = trpc.experiments.list.useQuery(
		{ websiteId },
		{
			enabled: !!websiteId,
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000, // 5 minutes
		}
	);

	const createMutation = trpc.experiments.create.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					['experiments', 'list'],
					{ input: { websiteId }, type: 'query' },
				],
			});
			toast.success('Experiment created successfully');
		},
		onError: (createError) => {
			console.error('Failed to create experiment:', createError);
			toast.error('Failed to create experiment');
		},
	});

	const updateMutation = trpc.experiments.update.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					['experiments', 'list'],
					{ input: { websiteId }, type: 'query' },
				],
			});
			toast.success('Experiment updated successfully');
		},
		onError: (updateError) => {
			console.error('Failed to update experiment:', updateError);
			toast.error('Failed to update experiment');
		},
	});

	const deleteMutation = trpc.experiments.delete.useMutation({
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					['experiments', 'list'],
					{ input: { websiteId }, type: 'query' },
				],
			});
			toast.success('Experiment deleted successfully');
		},
		onError: (deleteError) => {
			console.error('Failed to delete experiment:', deleteError);
			toast.error('Failed to delete experiment');
		},
	});

	const createExperiment = (data: CreateExperimentData) => {
		return createMutation.mutateAsync(data as CreateExperimentData);
	};

	const updateExperiment = (params: {
		experimentId: string;
		updates: UpdateExperimentData;
	}) => {
		return updateMutation.mutateAsync({
			id: params.experimentId,
			...params.updates,
		});
	};

	const deleteExperiment = (experimentId: string) => {
		return deleteMutation.mutateAsync({ id: experimentId });
	};

	const experiments = useMemo(() => experimentsData || [], [experimentsData]);

	return {
		data: experiments,
		isLoading,
		error,
		refetch,
		createExperiment,
		updateExperiment,
		deleteExperiment,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
	};
}

export function useExperiment(experimentId: string, websiteId: string) {
	const { data, isLoading, error, refetch } = trpc.experiments.getById.useQuery(
		{ id: experimentId, websiteId },
		{
			enabled: !!experimentId && !!websiteId,
			refetchOnWindowFocus: false,
			staleTime: 5 * 60 * 1000, // 5 minutes
		}
	);

	return {
		data,
		isLoading,
		error,
		refetch,
	};
}
