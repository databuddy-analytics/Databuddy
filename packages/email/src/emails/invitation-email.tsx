import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

const VOWEL_PREFIX_PATTERN = /^[aeiou]/i;

interface InvitationEmailProps {
	invitationLink: string;
	inviterName: string;
	organizationName: string;
	recipientEmail: string;
	role: string;
}

export const InvitationEmail = ({
	inviterName,
	organizationName,
	invitationLink,
	recipientEmail,
	role,
}: InvitationEmailProps) => {
	const org = organizationName || "a Databuddy organization";
	const inviter = inviterName || "A team member";
	const roleLabel = role || "member";
	const roleWithArticle = VOWEL_PREFIX_PATTERN.test(roleLabel)
		? `an ${roleLabel}`
		: `a ${roleLabel}`;

	return (
		<EmailLayout preview={`Join ${org} as ${roleLabel}`} tagline="Invitation">
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					Join {org}
				</Heading>
				<Text
					className="m-0 mb-4 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					<span style={{ color: emailBrand.foreground, fontWeight: 500 }}>
						{inviter}
					</span>{" "}
					invited you to join {org} on Databuddy as {roleWithArticle}.
				</Text>
				<Text
					className="m-0 mb-6 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					This invitation is for {recipientEmail}. Sign in or create an account
					with that address before accepting it.
				</Text>
			</Section>
			<Section className="text-center">
				<EmailButton href={invitationLink}>Review invitation</EmailButton>
			</Section>
			<EmailNote>
				This invitation expires in {AUTH_EMAIL_EXPIRY_LABELS.invitation}. If you
				did not expect it, you can ignore this email.
			</EmailNote>
			<EmailLinkFallback href={invitationLink} />
		</EmailLayout>
	);
};

InvitationEmail.PreviewProps = {
	invitationLink: "https://app.databuddy.cc/invite/abc123",
	inviterName: "Ada Lovelace",
	organizationName: "Acme Inc",
	recipientEmail: "grace@example.com",
	role: "admin",
} satisfies InvitationEmailProps;

export default InvitationEmail;
