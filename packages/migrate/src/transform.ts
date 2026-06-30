export const MAPPINGS: ReadonlyArray<readonly [string, string]> = [
	["data-pirsch-duration=", "data-duration="],
	["data-pirsch-meta-", "data-"],
	["data-pirsch-event=", "data-track="],
	["data-rybbit-prop-", "data-"],
	["data-rybbit-event=", "data-track="],
	["data-umami-event-", "data-"],
	["data-umami-event=", "data-track="],
];

export interface TransformResult {
	changes: number;
	output: string;
}

export function transform(input: string): TransformResult {
	let output = input;
	let changes = 0;
	for (const [from, to] of MAPPINGS) {
		const parts = output.split(from);
		if (parts.length === 1) {
			continue;
		}
		changes += parts.length - 1;
		output = parts.join(to);
	}
	return { output, changes };
}
