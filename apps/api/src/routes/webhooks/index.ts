import { Elysia } from "elysia";
import { autumnWebhook } from "./autumn";

export const webhooks = new Elysia({ prefix: "/webhooks" }).use(autumnWebhook);
