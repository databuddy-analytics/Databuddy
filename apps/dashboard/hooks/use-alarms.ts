import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export function useAlarms(organizationId: string, websiteId?: string) {
	const queryClient = useQueryClient();

	const query = useQuery({
		...orpc.alarms.list.queryOptions({
			input: { organizationId, websiteId },
		}),
		enabled: !!organizationId,
	});

	const createMutation = useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId, websiteId },
				}),
			});
			toast.success("Alarm created successfully");
		},
		onError: (error) => {
			toast.error(`Failed to create alarm: ${error.message}`);
		},
	});

	const updateMutation = useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId, websiteId },
				}),
			});
			toast.success("Alarm updated successfully");
		},
		onError: (error) => {
			toast.error(`Failed to update alarm: ${error.message}`);
		},
	});

	const deleteMutation = useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.alarms.list.key({
					input: { organizationId, websiteId },
				}),
			});
			toast.success("Alarm deleted successfully");
		},
		onError: (error) => {
			toast.error(`Failed to delete alarm: ${error.message}`);
		},
	});

	const testMutation = useMutation({
		...orpc.alarms.test.mutationOptions(),
		onSuccess: (data) => {
			const successCount = data.results.filter((r) => r.success).length;
			const totalCount = data.results.length;

			if (successCount === totalCount) {
				toast.success(
					`Test notifications sent successfully to all ${totalCount} channels`
				);
			} else if (successCount > 0) {
				toast.warning(
					`Test sent to ${successCount}/${totalCount} channels. Check configuration for failed channels.`
				);
			} else {
				toast.error(
					"All test notifications failed. Please check your configuration."
				);
			}
		},
		onError: (error) => {
			toast.error(`Failed to send test notification: ${error.message}`);
		},
	});

	return {
		alarms: query.data ?? [],
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		refetch: query.refetch,
		createAlarm: createMutation.mutateAsync,
		updateAlarm: updateMutation.mutateAsync,
		deleteAlarm: deleteMutation.mutateAsync,
		testAlarm: testMutation.mutateAsync,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isTesting: testMutation.isPending,
	};
}

export function useAlarm(id: string, organizationId: string) {
	return useQuery({
		...orpc.alarms.get.queryOptions({ input: { id, organizationId } }),
		enabled: !!id && !!organizationId,
	});
}
