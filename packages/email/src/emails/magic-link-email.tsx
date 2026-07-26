import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface MagicLinkEmailProps {
	url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
	<EmailLayout
		preview={`Sign in securely. This single-use link expires in ${AUTH_EMAIL_EXPIRY_LABELS.magicLink}.`}
		tagline="Sign in to Databuddy"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Your sign-in link
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Use the button below to sign in to your Databuddy account. You do not
				need a password for this sign-in.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Sign in to Databuddy</EmailButton>
		</Section>
		<EmailNote>
			This link expires in {AUTH_EMAIL_EXPIRY_LABELS.magicLink} and can only be
			used once. If you did not request it, you can ignore this email.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

MagicLinkEmail.PreviewProps = {
	url: "https://app.databuddy.cc/magic/abc123",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;
