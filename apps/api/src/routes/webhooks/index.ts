import { Elysia } from "elysia";
import { autumnWebhook } from "./autumn";
import { githubWebhook } from "./github";

export const webhooks = new Elysia({ prefix: "/webhooks" })
	.use(autumnWebhook)
	.use(githubWebhook);
