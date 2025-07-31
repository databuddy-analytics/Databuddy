import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './email-layout';

interface ResetPasswordEmailProps {
	url: string;
}

export const ResetPasswordEmail = ({ url }: ResetPasswordEmailProps) => {
	return (
		<EmailLayout preview="Reset your password">
			<Section className="my-6">
				<Heading className="text-center font-semibold text-2xl">
					Reset Your Password
				</Heading>
				<Text className="text-center">
					Someone requested a password reset for your Databuddy account. If this
					was you, click the button below to reset your password.
				</Text>
			</Section>
			<Section className="text-center">
				<Button
					className="rounded bg-brand px-5 py-3 text-center font-medium text-sm text-white"
					href={url}
				>
					Reset Password
				</Button>
			</Section>
			<Section className="my-6">
				<Text className="text-center">
					This link will expire in 1 hour. If you did not request a password
					reset, you can safely ignore this email.
				</Text>
				<Text className="mt-4 text-center text-muted-foreground">
					If you're having trouble with the button above, copy and paste the URL
					below into your web browser.
				</Text>
				<Text className="mt-2 max-w-full overflow-x-auto text-center text-muted-foreground text-sm">
					{url}
				</Text>
			</Section>
		</EmailLayout>
	);
};

export default ResetPasswordEmail;
