import { describe, expect, mock, test } from "bun:test";
import { EmailProvider } from "../../providers/email";
import type { EmailPayload, NotificationPayload } from "../../types";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

function createMockSendEmail() {
	const calls: EmailPayload[] = [];
	const fn = mock(async (payload: EmailPayload) => {
		calls.push(payload);
		return { id: "msg_123" };
	});
	return { fn, calls };
}

describe("EmailProvider", () => {
	test("calls sendEmailAction with correct subject and content", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});
		await provider.send(basePayload);
		expect(calls).toHaveLength(1);
		expect(calls[0].subject).toBe("Test Alert");
		expect(calls[0].text).toContain("Something happened");
		expect(calls[0].html).toContain("Test Alert");
		expect(calls[0].html).toContain("Something happened");
	});

	test("uses metadata.to for recipient", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });
		await provider.send({
			...basePayload,
			metadata: { to: "specific@example.com" },
		});
		expect(calls[0].to).toBe("specific@example.com");
	});

	test("falls back to defaultTo when metadata.to absent", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "default@example.com",
		});
		await provider.send(basePayload);
		expect(calls[0].to).toBe("default@example.com");
	});

	test("returns error when no recipient available", async () => {
		const { fn } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("recipient");
	});

	test("excludes 'to' key from metadata table in HTML", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });
		await provider.send({
			...basePayload,
			metadata: { to: "a@b.com", foo: "bar" },
		});
		const html = calls[0].html!;
		const tableRows = html.match(/<tr>/g) || [];
		expect(tableRows).toHaveLength(1);
	});

	test("escapes HTML in title and message", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});
		await provider.send({
			title: "<script>alert('xss')</script>",
			message: "Hello <b>world</b>",
		});
		const html = calls[0].html!;
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;b&gt;");
	});

	test("includes from field when configured", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
			from: "alerts@acme.com",
		});
		await provider.send(basePayload);
		expect(calls[0].from).toBe("alerts@acme.com");
	});

	test("returns success result when sendEmailAction resolves", async () => {
		const { fn } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});
		const result = await provider.send(basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("email");
	});

	test("returns error when sendEmailAction throws", async () => {
		const fn = mock(async () => {
			throw new Error("SMTP connection failed");
		});
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});
		const result = await provider.send(basePayload);
		expect(result.success).toBe(false);
		expect(result.channel).toBe("email");
		expect(result.error).toContain("SMTP connection failed");
	});
});
