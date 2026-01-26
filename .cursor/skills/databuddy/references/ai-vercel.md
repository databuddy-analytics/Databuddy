# AI/LLM Analytics Reference

The AI SDK integration (`@databuddy/sdk/ai/vercel`) provides LLM observability for applications using the Vercel AI SDK.

## Installation

```bash
bun add @databuddy/sdk ai @ai-sdk/openai
```

## Basic Usage

```typescript
import { databuddyLLM } from "@databuddy/sdk/ai/vercel";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// Initialize tracking
const { track } = databuddyLLM({
  apiKey: process.env.DATABUDDY_API_KEY,
});

// Wrap your model
const model = track(openai("gpt-4o"));

// Use as normal - calls are automatically tracked
const { text } = await generateText({
  model,
  prompt: "Hello, how are you?",
});
```

## Configuration

### databuddyLLM Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `DATABUDDY_API_KEY` env | Your API key |
| `apiUrl` | `string` | `https://basket.databuddy.cc/llm` | Custom API endpoint |
| `transport` | `Transport` | HTTP | Custom transport function |
| `computeCosts` | `boolean` | `true` | Calculate token costs |
| `privacyMode` | `boolean` | `false` | Exclude input/output content |
| `maxContentSize` | `number` | `1048576` | Max content size in bytes |
| `onSuccess` | `(call: AICall) => void` | — | Success callback |
| `onError` | `(call: AICall) => void` | — | Error callback |

## Track Options

Per-call options when wrapping a model:

```typescript
const model = track(openai("gpt-4o"), {
  traceId: "custom-trace-id",
  computeCosts: true,
  privacyMode: false,
  transport: customTransport,
  onSuccess: (call) => console.log("Success:", call),
  onError: (call) => console.error("Error:", call),
});
```

| Option | Type | Description |
|--------|------|-------------|
| `traceId` | `string` | Custom trace ID for correlation |
| `computeCosts` | `boolean` | Override cost calculation |
| `privacyMode` | `boolean` | Override privacy mode |
| `transport` | `Transport` | Override transport |
| `onSuccess` | `(call: AICall) => void` | Success callback |
| `onError` | `(call: AICall) => void` | Error callback |

## Privacy Mode

Enable privacy mode to exclude input/output content from logs:

```typescript
const { track } = databuddyLLM({
  apiKey: "...",
  privacyMode: true, // No prompts or responses stored
});
```

## Tracked Data

Each LLM call tracks:

### AICall Structure

```typescript
interface AICall {
  timestamp: Date;
  traceId: string;
  type: "generate" | "stream";
  model: string;
  provider: string;
  finishReason?: string;
  input: Message[];      // (empty if privacyMode)
  output: Message[];     // (empty if privacyMode)
  usage: TokenUsage;
  cost: TokenCost;
  tools: ToolCallInfo;
  durationMs: number;
  httpStatus?: number;
  error?: AIError;
}
```

### Token Usage

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  webSearchCount?: number;
}
```

### Token Costs

```typescript
interface TokenCost {
  inputCost?: number;    // Cost in USD
  outputCost?: number;   // Cost in USD
  totalCost?: number;    // Total cost in USD
}
```

### Tool Information

```typescript
interface ToolCallInfo {
  toolCallCount: number;
  toolResultCount: number;
  toolCallNames: string[];
  availableTools?: string[];
}
```

## Streaming Support

Streaming is fully supported - the SDK captures all stream events:

```typescript
import { streamText } from "ai";

const { track } = databuddyLLM({ apiKey: "..." });
const model = track(openai("gpt-4o"));

const result = await streamText({
  model,
  prompt: "Write a poem about AI",
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
// Tracking happens automatically when stream completes
```

## Tool Calls

Tool usage is automatically tracked:

```typescript
import { generateText, tool } from "ai";
import { z } from "zod";

const { track } = databuddyLLM({ apiKey: "..." });
const model = track(openai("gpt-4o"));

const { text, toolCalls } = await generateText({
  model,
  prompt: "What's the weather in London?",
  tools: {
    getWeather: tool({
      description: "Get current weather",
      parameters: z.object({
        city: z.string(),
      }),
      execute: async ({ city }) => {
        return { temperature: 20, condition: "sunny" };
      },
    }),
  },
});
// Tool calls are tracked in the AICall.tools field
```

## Custom Transport

Implement a custom transport for special logging needs:

```typescript
import type { Transport } from "@databuddy/sdk/ai/vercel";

const customTransport: Transport = async (call) => {
  // Send to your custom endpoint
  await fetch("https://your-api.com/logs", {
    method: "POST",
    body: JSON.stringify(call),
  });
};

const { track } = databuddyLLM({
  transport: customTransport,
});
```

## HTTP Transport

Use the built-in HTTP transport with custom configuration:

```typescript
import { httpTransport } from "@databuddy/sdk/ai/vercel";

const transport = httpTransport({
  url: "https://custom-endpoint.com/llm",
  headers: { "X-Custom-Header": "value" },
});

const { track } = databuddyLLM({ transport });
```

## Trace ID Generation

Generate trace IDs for correlation:

```typescript
import { generateTraceId } from "@databuddy/sdk/ai/vercel";

const traceId = generateTraceId();

const model = track(openai("gpt-4o"), { traceId });
```

## Error Handling

Errors are automatically tracked with full context:

```typescript
const { track } = databuddyLLM({
  apiKey: "...",
  onError: (call) => {
    console.error("LLM Error:", {
      model: call.model,
      error: call.error?.message,
      durationMs: call.durationMs,
    });
  },
});
```

## Provider Support

Works with any Vercel AI SDK provider:

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";

const { track } = databuddyLLM({ apiKey: "..." });

// OpenAI
const gpt4 = track(openai("gpt-4o"));

// Anthropic
const claude = track(anthropic("claude-3-opus"));

// Google
const gemini = track(google("gemini-pro"));

// Mistral
const mistralModel = track(mistral("mistral-large"));
```

## Best Practices

### Use Trace IDs for Correlation

```typescript
function handleRequest(req) {
  const traceId = req.headers["x-trace-id"] || generateTraceId();
  
  const model = track(openai("gpt-4o"), { traceId });
  
  // All LLM calls in this request share the trace ID
}
```

### Enable Privacy Mode for PII

```typescript
// For user-facing applications with sensitive data
const { track } = databuddyLLM({
  apiKey: "...",
  privacyMode: true, // Don't log prompts/responses
});
```

### Handle Callbacks for Monitoring

```typescript
const { track } = databuddyLLM({
  apiKey: "...",
  onSuccess: (call) => {
    metrics.recordLatency(call.durationMs);
    metrics.recordTokens(call.usage.totalTokens);
    metrics.recordCost(call.cost.totalCost);
  },
  onError: (call) => {
    alerting.notify("LLM Error", call.error);
  },
});
```
