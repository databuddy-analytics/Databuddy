import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface DeleteAccountEmailProps {
	url: string;
}

export const DeleteAccountEmail = ({ url }: DeleteAccountEmailProps) => (
	<EmailLayout
		preview={`Confirm your account deletion request. This link expires in ${AUTH_EMAIL_EXPIRY_LABELS.accountDeletion}.`}
		tagline="Account deletion request"
	>
		<Section className="text-center">
			<Heading
				className="m-0 mb-3 font-semibold text-xl tracking-tight"
				style={{ color: emailBrand.foreground }}
			>
				Confirm account deletion
			</Heading>
			<Text
				className="m-0 mb-6 text-sm leading-relaxed"
				style={{ color: emailBrand.muted }}
			>
				Deleting your account removes your Databuddy login and access. Shared
				organization data may remain for other members. If you own an
				organization, transfer ownership before continuing. This action cannot
				be undone.
			</Text>
		</Section>
		<Section className="text-center">
			<EmailButton href={url}>Delete my account</EmailButton>
		</Section>
		<EmailNote>
			This link expires in {AUTH_EMAIL_EXPIRY_LABELS.accountDeletion}. If you
			did not request this, ignore the email; your account will not be deleted.
		</EmailNote>
		<EmailLinkFallback href={url} />
	</EmailLayout>
);

DeleteAccountEmail.PreviewProps = {
	url: "https://app.databuddy.cc/delete-account/abc123",
} satisfies DeleteAccountEmailProps;

export default DeleteAccountEmail;
