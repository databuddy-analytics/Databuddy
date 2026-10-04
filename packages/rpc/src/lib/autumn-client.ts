import { billingMode, config } from "@databuddy/env/app";
import { BillingUnavailableError } from "@databuddy/shared/billing";
import { Autumn, AutumnError, HTTPClient, HTTPClientError } from "autumn-js";

export {
	BillingUnavailableError,
	isBillingUnavailable,
} from "@databuddy/shared/billing";
export { AutumnError } from "autumn-js";

type Fetcher = NonNullable<
	ConstructorParameters<typeof HTTPClient>[0]
>["fetcher"];

export function createAutumnClient(options: {
	secretKey: string;
	fetcher?: Fetcher;
}): Autumn {
	const httpClient = new HTTPClient({ fetcher: options.fetcher });
	httpClient.addHook("response", (response) => {
		if (response.status === 202) {
			throw new Error("Autumn returned an unconfirmed billing response");
		}
	});
	return new Autumn({
		secretKey: options.secretKey,
		httpClient,
		failOpen: false,
		timeoutMs: 5000,
		retryConfig: { strategy: "none" },
	});
}

let instance: Autumn | null = null;

export function getAutumn(): Autumn {
	const secretKey = config.services.autumnSecretKey;
	if (billingMode() !== "live" || !secretKey) {
		throw new BillingUnavailableError("Autumn billing is not configured");
	}
	instance ??= createAutumnClient({ secretKey });
	return instance;
}

export async function autumnCall<T>(
	operation: string,
	call: () => Promise<T>
): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (error instanceof AutumnError || error instanceof HTTPClientError) {
			throw new BillingUnavailableError(`Autumn ${operation} failed`, {
				cause: error,
			});
		}
		throw error;
	}
}
