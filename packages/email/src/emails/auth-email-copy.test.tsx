import { describe, expect, test } from "bun:test";
import { render } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { DeleteAccountEmail } from "./delete-account-email";
import { InvitationEmail } from "./invitation-email";
import { MagicLinkEmail } from "./magic-link-email";
import { OtpEmail } from "./otp-email";
import { VerificationEmail } from "./verification-email";

const asText = (element: React.ReactElement) =>
	render(element, { plainText: true });

describe("authentication email copy", () => {
	test("magic-link and verification copy use the shared expiry labels", async () => {
		const magicLink = await asText(
			MagicLinkEmail({ url: "https://example.com/magic" })
		);
		const verification = await asText(
			VerificationEmail({ url: "https://example.com/verify" })
		);

		expect(magicLink).toContain(
			`expires in ${AUTH_EMAIL_EXPIRY_LABELS.magicLink}`
		);
		expect(magicLink).not.toContain("expires in 24 hours");
		expect(verification).toContain(
			`expires in ${AUTH_EMAIL_EXPIRY_LABELS.emailVerification}`
		);
	});

	test("OTP copy explains the requested action", async () => {
		const signIn = await asText(OtpEmail({ otp: "123456", type: "sign-in" }));
		const passwordReset = await asText(
			OtpEmail({ otp: "123456", type: "forget-password" })
		);

		expect(signIn).toContain("Enter this code on the sign-in screen");
		expect(passwordReset).toContain("password reset screen");
		expect(passwordReset).not.toContain("complete your sign-in");
		expect(passwordReset).toContain(
			`expires in ${AUTH_EMAIL_EXPIRY_LABELS.oneTimeCode}`
		);
	});

	test("invitation copy names the role and recipient email", async () => {
		const text = await asText(
			InvitationEmail({
				invitationLink: "https://example.com/invitation",
				inviterName: "Ada",
				organizationName: "Acme",
				recipientEmail: "grace@example.com",
				role: "admin",
			})
		);

		expect(text).toContain("as an admin");
		expect(text).toContain("for grace@example.com");
		expect(text).toContain(`expires in ${AUTH_EMAIL_EXPIRY_LABELS.invitation}`);
	});

	test("account deletion copy does not claim organization data is deleted", async () => {
		const text = await asText(
			DeleteAccountEmail({ url: "https://example.com/delete" })
		);

		expect(text).not.toContain("all your data");
		expect(text).toContain("transfer ownership before continuing");
		expect(text).toContain("cannot be undone");
	});
});
