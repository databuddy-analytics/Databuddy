import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const apiKey = process.env.AI_API_KEY;

const headers = {
    "HTTP-Referer": "https://www.databuddy.cc/",
    "X-Title": "Databuddy",
};

export const openrouter = createOpenRouter({
    apiKey,
    headers,
});