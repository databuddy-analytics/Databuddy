import { createServer, type ServerResponse } from "node:http";
import type { BusinessContextSettings } from "@databuddy/shared/organization-business-context";
import { test as base } from "./fixtures";

export function businessContextEvent(value: BusinessContextSettings) {
	return `event: message\ndata: ${JSON.stringify({ json: value })}\n\n`;
}

interface GenerateInput {
	organizationId: string;
	sourceUrls: string[];
	websiteId: string;
}

interface ContextStream {
	connected: Promise<void>;
	disconnected: Promise<void>;
	end: () => void;
	intercept: () => Promise<void>;
	requests: GenerateInput[];
	send: (value: BusinessContextSettings) => void;
}

// A real HTTP response is needed: route.fulfill buffers its entire SSE body.
export const test = base.extend<{ contextStream: ContextStream }>({
	contextStream: async ({ page }, use) => {
		let response: ServerResponse | undefined;
		const requests: GenerateInput[] = [];
		let connected: (() => void) | undefined;
		let disconnected: (() => void) | undefined;
		const connection = new Promise<void>((resolve) => {
			connected = resolve;
		});
		const disconnection = new Promise<void>((resolve) => {
			disconnected = resolve;
		});
		const server = createServer(async (request, result) => {
			result.setHeader(
				"Access-Control-Allow-Origin",
				new URL(page.url()).origin
			);
			result.setHeader("Access-Control-Allow-Credentials", "true");
			result.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
			result.setHeader(
				"Access-Control-Allow-Headers",
				request.headers["access-control-request-headers"] ?? "content-type"
			);
			if (request.method === "OPTIONS") {
				result.writeHead(204).end();
				return;
			}
			let body = "";
			for await (const chunk of request) {
				body += chunk.toString();
			}
			requests.push((JSON.parse(body) as { json: GenerateInput }).json);
			response = result;
			result.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
			});
			result.flushHeaders();
			result.once("close", () => disconnected?.());
			connected?.();
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve)
		);
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Missing stream fixture port");
		}
		try {
			await use({
				connected: connection,
				disconnected: disconnection,
				requests,
				intercept: async () => {
					await page.route("**/rpc/businessContext/generate", (route) =>
						route.continue({ url: `http://127.0.0.1:${address.port}/generate` })
					);
				},
				send: (value) => {
					if (!response) {
						throw new Error(
							"Wait for the generation request before sending a snapshot"
						);
					}
					response.write(businessContextEvent(value));
				},
				end: () => response?.end(),
			});
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	},
});
