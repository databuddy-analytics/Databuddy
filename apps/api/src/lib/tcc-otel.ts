import { TCCSpanProcessor } from "@contextcompany/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import pkg from "../../package.json";

let sdk: NodeSDK | null = null;

/**
 * Registers OpenTelemetry with The Context Company's span processor so
 * Vercel AI SDK `experimental_telemetry` spans (ai.*) are exported to TCC.
 * No-op when TCC_API_KEY is unset (local dev without observability).
 */
export function initTccTracing(): void {
export function initTccTracing(): void {
	if (sdk || !process.env.TCC_API_KEY) {
		return;
	}

	try {
		sdk = new NodeSDK({
			resource: resourceFromAttributes({
				[ATTR_SERVICE_NAME]: "databuddy-api",
				[ATTR_SERVICE_VERSION]: pkg.version,
			}),
			spanProcessors: [new TCCSpanProcessor()],
		});
		sdk.start();
	} catch {
		sdk = null;
	}
}

export async function shutdownTccTracing(): Promise<void> {
	if (sdk) {
		await sdk.shutdown();
		sdk = null;
	}
}
