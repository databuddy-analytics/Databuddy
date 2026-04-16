import { vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("bun", () => ({
	randomUUIDv7: () => randomUUID(),
	CryptoHasher: class {
		private data: Buffer[] = [];
		private algo: string;
		constructor(algo: string) {
			this.algo = algo;
		}
		update(input: string | Buffer) {
			this.data.push(Buffer.from(input));
			return this;
		}
		digest(encoding: string) {
			const crypto = require("node:crypto");
			const hash = crypto.createHash(this.algo);
			for (const d of this.data) {
				hash.update(d);
			}
			return hash.digest(encoding);
		}
	},
}));
