"use client";

import type { InferSelectModel, alarms } from "@databuddy/db";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export type Alarm = InferSelectModel<typeof alarms>;

export const getAlarmsListKey = (
	organizationId?: string,
	websiteId?: string
): QueryKey =>
	orpc.alarms.list.queryKey({
		input: {
			organizationId: organizationId ?? "",
			websiteId,
		},
	});

const addAlarmToList = (old: Alarm[] | undefined, alarm: Alarm): Alarm[] => {
	if (!old) {
		return [alarm];
	}
	if (old.some((item) => item.id === alarm.id)) {
		return old;
	}
	return [alarm, ...old];
};

const updateAlarmInList = (old: Alarm[] | undefined, alarm: Alarm): Alarm[] => {
	if (!old) {
		return [alarm];
	}
	return old.map((item) => (item.id === alarm.id ? alarm : item));
};

const removeAlarmFromList = (
	old: Alarm[] | undefined,
	alarmId: string
): Alarm[] => {
	if (!old) {
		return [];
	}
	return old.filter((item) => item.id !== alarmId);
};

export function useAlarms(options?: { enabled?: boolean; websiteId?: string }) {
	const { activeOrganization, isLoading: isLoadingOrganization } =
		useOrganizationsContext();

	const query = useQuery({
		...orpc.alarms.list.queryOptions({
			input: {
				organizationId: activeOrganization?.id ?? "",
				websiteId: options?.websiteId,
			},
		}),
		enabled:
			options?.enabled !== false &&
			!isLoadingOrganization &&
			!!activeOrganization?.id,
	});

	return {
		alarms: query.data ?? [],
		isLoading: query.isLoading || isLoadingOrganization,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export function useCreateAlarm() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.alarms.create.mutationOptions(),
		onSuccess: (alarm: Alarm) => {
			const listKey = getAlarmsListKey(activeOrganization?.id);
			queryClient.setQueryData<Alarm[]>(listKey, (old) =>
				addAlarmToList(old, alarm)
			);
			if (alarm.websiteId) {
				const websiteKey = getAlarmsListKey(
					activeOrganization?.id,
					alarm.websiteId
				);
				queryClient.setQueryData<Alarm[]>(websiteKey, (old) =>
					addAlarmToList(old, alarm)
				);
			}
		},
	});
}

export function useUpdateAlarm() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.alarms.update.mutationOptions(),
		onSuccess: (alarm: Alarm) => {
			const listKey = getAlarmsListKey(activeOrganization?.id);
			queryClient.setQueryData<Alarm[]>(listKey, (old) =>
				updateAlarmInList(old, alarm)
			);
			if (alarm.websiteId) {
				const websiteKey = getAlarmsListKey(
					activeOrganization?.id,
					alarm.websiteId
				);
				queryClient.setQueryData<Alarm[]>(websiteKey, (old) =>
					updateAlarmInList(old, alarm)
				);
			}
		},
	});
}

export function useDeleteAlarm() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.alarms.delete.mutationOptions(),
		onSuccess: (alarm: Alarm) => {
			const listKey = getAlarmsListKey(activeOrganization?.id);
			queryClient.setQueryData<Alarm[]>(listKey, (old) =>
				removeAlarmFromList(old, alarm.id)
			);
			if (alarm.websiteId) {
				const websiteKey = getAlarmsListKey(
					activeOrganization?.id,
					alarm.websiteId
				);
				queryClient.setQueryData<Alarm[]>(websiteKey, (old) =>
					removeAlarmFromList(old, alarm.id)
				);
			}
		},
	});
}

export function useTestAlarm() {
	return useMutation({
		...orpc.alarms.test.mutationOptions(),
	});
}
