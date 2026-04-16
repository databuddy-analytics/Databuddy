import { Heading, Section, Text } from "@react-email/components";
import { sanitizeEmailText } from "../utils/sanitize";
import { emailBrand } from "./email-brand";
import { EmailButton } from "./email-button";
import { EmailLayout } from "./email-layout";
import { EmailLinkFallback } from "./email-link-fallback";
import { EmailNote } from "./email-note";

interface InvitationEmailProps {
	invitationLink: string;
	inviterName: string;
	organizationName: string;
}

export const InvitationEmail = ({
	inviterName,
	organizationName,
	invitationLink,
}: InvitationEmailProps) => {
	const safeOrg = sanitizeEmailText(organizationName) || "a team";
	const safeName = sanitizeEmailText(inviterName) || "A team member";

	return (
		<EmailLayout
			preview={`Join ${safeOrg} on Databuddy`}
			tagline="Team Invitation"
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					You're Invited!
				</Heading>
				<Text
					className="m-0 mb-6 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					<span style={{ color: emailBrand.foreground, fontWeight: 500 }}>
						{safeName}
					</span>{" "}
					has invited you to join{" "}
					<span style={{ color: emailBrand.foreground, fontWeight: 500 }}>
						{safeOrg}
					</span>{" "}
					on Databuddy.
				</Text>
			</Section>
			<Section className="text-center">
				<EmailButton href={invitationLink}>Accept Invitation</EmailButton>
			</Section>
			<EmailNote>
				This invitation expires in 48 hours. If you weren't expecting this, you
				can safely ignore this email.
			</EmailNote>
			<EmailLinkFallback href={invitationLink} />
		</EmailLayout>
	);
};

export default InvitationEmail;
