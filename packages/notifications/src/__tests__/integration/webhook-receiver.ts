export interface CapturedRequest {
	method: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
	timestamp: number;
}

export class WebhookReceiver {
	private server: ReturnType<typeof Bun.serve> | null = null;
	private requests: CapturedRequest[] = [];
	private failNextN = 0;
	private responseDelayMs = 0;

	async start(port = 0): Promise<number> {
		this.server = Bun.serve({
			port,
			fetch: async (req) => {
				const body = await req.json().catch(() => null);
				this.requests.push({
					method: req.method,
					path: new URL(req.url).pathname,
					headers: Object.fromEntries(req.headers.entries()),
					body,
					timestamp: Date.now(),
				});

				if (this.failNextN > 0) {
					this.failNextN--;
					return new Response("error", { status: 500 });
				}

				if (this.responseDelayMs > 0) {
					await Bun.sleep(this.responseDelayMs);
				}

				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		});
		return this.server.port;
	}

	getRequests(): CapturedRequest[] {
		return this.requests;
	}

	getLastRequest(): CapturedRequest | undefined {
		return this.requests.at(-1);
	}

	clear(): void {
		this.requests = [];
		this.failNextN = 0;
		this.responseDelayMs = 0;
	}

	failNext(n: number): void {
		this.failNextN = n;
	}

	setResponseDelay(ms: number): void {
		this.responseDelayMs = ms;
	}

	stop(): void {
		this.server?.stop(true);
		this.server = null;
	}
}
