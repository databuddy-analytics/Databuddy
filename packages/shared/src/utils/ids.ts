import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";

export type IdType = "UUID" | "NANOID";

export function createId(type: IdType = "UUID") {
	if (type === "NANOID") {
		return nanoid(10);
	}
	return randomUUID();
}
