export function selectDistinctWorkerCandidates<T extends {}>(
	candidates: readonly T[],
	limit: number,
	keyFor: (candidate: T) => string
): T[] {
	const selected: T[] = [];
	const keys = new Set<string>();
	for (const candidate of candidates) {
		const key = keyFor(candidate);
		if (keys.has(key)) {
			continue;
		}
		keys.add(key);
		selected.push(candidate);
		if (selected.length === limit) {
			break;
		}
	}
	return selected;
}

export type WorkerFanoutResult<T extends {}, R> =
	| { candidate: T; status: "fulfilled"; value: R }
	| { candidate: T; reason: unknown; status: "rejected" };

export async function runBoundedWorkerFanout<T extends {}, R>(
	candidates: readonly T[],
	concurrency: number,
	runWorker: (candidate: T) => Promise<R>
): Promise<WorkerFanoutResult<T, R>[]> {
	const results = new Array<WorkerFanoutResult<T, R>>(candidates.length);
	let next = 0;
	await Promise.all(
		Array.from(
			{ length: Math.min(concurrency, candidates.length) },
			async () => {
				while (next < candidates.length) {
					const index = next;
					next += 1;
					const candidate = candidates[index];
					if (candidate === undefined) {
						continue;
					}
					try {
						results[index] = {
							candidate,
							status: "fulfilled",
							value: await runWorker(candidate),
						};
					} catch (reason) {
						results[index] = { candidate, reason, status: "rejected" };
					}
				}
			}
		)
	);
	return results;
}
