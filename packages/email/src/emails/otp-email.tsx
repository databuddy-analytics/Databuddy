import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "./email-layout";

interface OtpEmailProps {
	otp: string;
}

export const OtpEmail = ({ otp }: OtpEmailProps) => (
	<EmailLayout preview="Your verification code">
		<Section className="my-6">
			<Heading className="text-center font-semibold text-2xl">
				Your Verification Code
			</Heading>
			<Text className="text-center">
				Here is your one-time password to complete your sign-in.
			</Text>
		</Section>
		<Section className="text-center">
			<Text className="rounded bg-muted px-10 py-4 text-center font-bold text-2xl tracking-widest">
				{otp}
			</Text>
		</Section>
		<Section className="my-6">
			<Text className="text-center">
				This code will expire in 10 minutes. If you did not request this code,
				you can safely ignore this email.
			</Text>
		</Section>
	</EmailLayout>
);

export default OtpEmail;
