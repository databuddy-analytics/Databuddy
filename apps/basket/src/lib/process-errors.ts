import { captureError } from "@lib/tracing";
import { log } from "evlog";

type ShutdownHandler = (
	signal: string,
	exitCode: number
) => Promise<void> | void;

const SHUTDOWN_TIMEOUT_MS = 10_000;

function describeError(error: unknown): {
	message: string;
	stack?: string;
} {
	if (error instanceof Error) {
		return { message: error.message, stack: error.stack };
	}

	return { message: String(error) };
}

function logProcessError(processName: string, error: unknown): void {
	const { message, stack } = describeError(error);

	captureError(error);
	log.error({
		process: processName,
		error_message: message,
		error_stack: stack,
		error_source: "process",
	});
}

function logShutdownError(error: unknown): void {
	const { message } = describeError(error);
	log.error({
		process: "uncaughtException",
		error_message: message,
		error_source: "shutdown",
	});
}

function fatalExit(reason: string): never {
	log.error({ process: "uncaughtException", reason, error_source: "fatal" });
	process.exit(1);
}

export function handleUnhandledRejection(
	reason: unknown,
	shutdown: ShutdownHandler
): void {
	logProcessError("unhandledRejection", reason);
	runFatalShutdown(shutdown, "unhandledRejection");
}

export function handleUncaughtException(
	error: unknown,
	shutdown: ShutdownHandler
): void {
	logProcessError("uncaughtException", error);
	runFatalShutdown(shutdown, "uncaughtException");
}

function runFatalShutdown(shutdown: ShutdownHandler, signal: string): void {
	let exited = false;
	const timer = setTimeout(() => {
		if (exited) {
			return;
		}
		fatalExit(`${signal}: shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms`);
	}, SHUTDOWN_TIMEOUT_MS);
	timer.unref?.();

	const finish = (errored: boolean, err?: unknown) => {
		if (exited) {
			return;
		}
		exited = true;
		clearTimeout(timer);
		if (errored) {
			logShutdownError(err);
		}
		process.exit(1);
	};

	try {
		const result = shutdown(signal, 1);
		if (result && typeof (result as Promise<void>).then === "function") {
			(result as Promise<void>).then(
				() => finish(false),
				(shutdownError) => finish(true, shutdownError)
			);
		} else {
			finish(false);
		}
	} catch (shutdownError) {
		finish(true, shutdownError);
	}
}
