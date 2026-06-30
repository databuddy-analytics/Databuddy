import { runLifecycleCommand } from "../src/e2e-db-lifecycle";

function formatError(error: unknown): string {
	if (error instanceof AggregateError) {
		return error.errors
			.map((cause) => (cause instanceof Error ? cause.message : String(cause)))
			.join("; ");
	}
	if (error instanceof Error) {
		return error.message || error.name;
	}
	return String(error);
}

try {
	const output = await runLifecycleCommand(process.argv.slice(2));
	console.log(output);
} catch (error) {
	console.error(`e2e-db-lifecycle: ${formatError(error)}`);
	process.exit(1);
}
