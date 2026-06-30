import type { DigestConfigSummary, DigestFrequency } from "./digest-summary";

export interface RescheduleInput {
	cron?: string;
	frequency?: DigestFrequency;
	timezone?: string;
}

export interface ReschedulePatch {
	cron?: string | null;
	frequency?: DigestFrequency;
	timezone?: string;
}

export interface RescheduleProposal {
	changes: string[];
	cron: string | null;
	frequency: DigestFrequency;
	timezone: string;
}

export function computeReschedulePatch(
	input: RescheduleInput
): ReschedulePatch {
	const { cron, timezone, frequency } = input;
	const patch: ReschedulePatch = {};

	if (cron !== undefined) {
		patch.cron = cron;
		if (frequency === undefined) {
			patch.frequency = "custom";
		}
	}
	if (timezone !== undefined) {
		patch.timezone = timezone;
	}
	if (frequency !== undefined) {
		patch.frequency = frequency;
		if (frequency !== "custom" && cron === undefined) {
			patch.cron = null;
		}
	}

	return patch;
}

export function computeRescheduleProposal(
	existing: Pick<DigestConfigSummary, "cron" | "frequency" | "timezone">,
	input: RescheduleInput
): RescheduleProposal {
	const proposedFrequency: DigestFrequency =
		input.frequency ??
		(input.cron === undefined ? existing.frequency : "custom");

	let proposedCron: string | null;
	if (
		input.frequency !== undefined &&
		input.frequency !== "custom" &&
		input.cron === undefined
	) {
		proposedCron = null;
	} else if (input.cron === undefined) {
		proposedCron = existing.cron;
	} else {
		proposedCron = input.cron;
	}

	const proposedTimezone = input.timezone ?? existing.timezone;

	const changes: string[] = [];
	if (proposedFrequency !== existing.frequency) {
		changes.push(`cadence ${existing.frequency} -> ${proposedFrequency}`);
	}
	if (proposedCron !== existing.cron) {
		changes.push(
			`cron ${existing.cron ?? "none"} -> ${proposedCron ?? "none"}`
		);
	}
	if (proposedTimezone !== existing.timezone) {
		changes.push(`timezone ${existing.timezone} -> ${proposedTimezone}`);
	}

	return {
		changes,
		cron: proposedCron,
		frequency: proposedFrequency,
		timezone: proposedTimezone,
	};
}
