"use client";

import {
	convertToTimezone,
	formatDate,
	getBrowserTimezone,
} from "@databuddy/shared/utils/date-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { orpc } from "@/lib/orpc";

type UserPreferences = {
	timezone: string;
	dateFormat: string;
	timeFormat: string;
};

const defaultPreferences: UserPreferences = {
	timezone: "auto",
	dateFormat: "MMM D, YYYY",
	timeFormat: "h:mm a",
};

export function usePreferences() {
	const {
		data: preferences,
		isLoading: loading,
		error,
		refetch,
	} = useQuery({
		...orpc.preferences.getUserPreferences.queryOptions(),
	});

	const updateMutation = useMutation({
		...orpc.preferences.updateUserPreferences.mutationOptions(),
	});

	const getEffectiveTimezone = useCallback(() => {
		if (!preferences) {
			return getBrowserTimezone();
		}
		return preferences.timezone === "auto"
			? getBrowserTimezone()
			: preferences.timezone;
	}, [preferences]);

	const formatWithPreferences = useCallback(
		(
			date: Date | string | number,
			options?: {
				showTime?: boolean;
				customFormat?: string;
			}
		) => {
			if (!date) {
				return "";
			}
			const timezone = getEffectiveTimezone();
			return formatDate(date, {
				timezone,
				dateFormat: preferences?.dateFormat || defaultPreferences.dateFormat,
				timeFormat: preferences?.timeFormat || defaultPreferences.timeFormat,
				showTime: options?.showTime,
				customFormat: options?.customFormat,
			});
		},
		[preferences, getEffectiveTimezone]
	);

	const convertToUserTimezone = useCallback(
		(date: Date | string | number) => {
			const timezone = getEffectiveTimezone();
			return convertToTimezone(date, timezone);
		},
		[getEffectiveTimezone]
	);

	return {
		preferences,
		loading,
		error,
		refetch,
		updatePreferences: updateMutation.mutateAsync,
		formatDate: formatWithPreferences,
		convertToTimezone: convertToUserTimezone,
		getEffectiveTimezone,
	};
}
