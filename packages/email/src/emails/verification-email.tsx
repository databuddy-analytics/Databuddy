import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface VerificationEmailProps {
	url: string;
}

export const VerificationEmail = ({ url }: VerificationEmailProps) => (
	<EmailLayout
		preview={`Verify your email to start using Databuddy. This link expires in ${AUTH_EMAIL_EXPIRY_LABELS.emailVerification}.`}
		tagline="Welcome to Databuddy"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Verify your email
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Thanks for signing up! Click the button below to verify your email
				address and get started.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Verify email address</EmailButton>
		</Section>
		<EmailNote>
			This link expires in {AUTH_EMAIL_EXPIRY_LABELS.emailVerification}. If you
			did not create an account, you can ignore this email.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

VerificationEmail.PreviewProps = {
	url: "https://app.databuddy.cc/verify/abc123",
} satisfies VerificationEmailProps;

export default VerificationEmail;
