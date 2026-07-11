import { Heading, Section, Text } from "react-email";
import { AUTH_EMAIL_EXPIRY_LABELS } from "./auth-email-expiry";
import { emailBrand } from "./email-brand";
import { EmailLayout } from "./email-layout";
import { EmailNote } from "./email-note";

export type OtpPurpose =
	| "sign-in"
	| "email-verification"
	| "forget-password"
	| "change-email";

interface OtpEmailProps {
	otp: string;
	type: OtpPurpose;
}

const PURPOSE_COPY: Record<
	OtpPurpose,
	{ heading: string; instruction: string; preview: string; tagline: string }
> = {
	"sign-in": {
		heading: "Sign in to Databuddy",
		instruction:
			"Enter this code on the sign-in screen to access your account.",
		preview: "Use this one-time code to sign in to Databuddy.",
		tagline: "Sign-in code",
	},
	"email-verification": {
		heading: "Verify your email",
		instruction: "Enter this code to verify your email address.",
		preview: "Use this one-time code to verify your email address.",
		tagline: "Email verification",
	},
	"forget-password": {
		heading: "Reset your password",
		instruction: "Enter this code on the password reset screen to continue.",
		preview: "Use this one-time code to reset your Databuddy password.",
		tagline: "Password reset",
	},
	"change-email": {
		heading: "Confirm your email change",
		instruction: "Enter this code to confirm your new email address.",
		preview: "Use this one-time code to confirm your email change.",
		tagline: "Email change",
	},
};

export const OtpEmail = ({ otp, type }: OtpEmailProps) => {
	const copy = PURPOSE_COPY[type];

	return (
		<EmailLayout
			preview={`${copy.preview} It expires in ${AUTH_EMAIL_EXPIRY_LABELS.oneTimeCode}.`}
			tagline={copy.tagline}
		>
			<Section className="text-center">
				<Heading
					className="m-0 mb-3 font-semibold text-xl tracking-tight"
					style={{ color: emailBrand.foreground }}
				>
					{copy.heading}
				</Heading>
				<Text
					className="m-0 mb-6 text-sm leading-relaxed"
					style={{ color: emailBrand.muted }}
				>
					{copy.instruction} Do not share this code with anyone.
				</Text>
			</Section>
			<Section className="text-center">
				<Text
					className="m-0 inline-block rounded px-8 py-4 font-bold font-mono text-2xl"
					style={{
						backgroundColor: emailBrand.inset,
						border: `1px solid ${emailBrand.border}`,
						color: emailBrand.foreground,
						letterSpacing: "0.3em",
					}}
				>
					{otp}
				</Text>
			</Section>
			<EmailNote>
				This code expires in {AUTH_EMAIL_EXPIRY_LABELS.oneTimeCode}. If you did
				not request it, you can ignore this email. If this keeps happening,
				change your password or contact support.
			</EmailNote>
		</EmailLayout>
	);
};

OtpEmail.PreviewProps = {
	otp: "482913",
	type: "sign-in",
} satisfies OtpEmailProps;

export default OtpEmail;
