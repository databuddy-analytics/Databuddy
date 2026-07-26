import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface ResetPasswordEmailProps {
	url: string;
}

export const ResetPasswordEmail = ({ url }: ResetPasswordEmailProps) => (
	<EmailLayout
		preview={`Choose a new password. This link expires in ${AUTH_EMAIL_EXPIRY_LABELS.passwordReset}.`}
		tagline="Password Reset"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Reset your password
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				We received a request to reset your password. Click the button below to
				choose a new one.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Reset password</EmailButton>
		</Section>
		<EmailNote>
			This link expires in {AUTH_EMAIL_EXPIRY_LABELS.passwordReset}. If you did
			not request a password reset, you can ignore this email.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

ResetPasswordEmail.PreviewProps = {
	url: "https://app.databuddy.cc/reset/abc123",
} satisfies ResetPasswordEmailProps;

export default ResetPasswordEmail;
