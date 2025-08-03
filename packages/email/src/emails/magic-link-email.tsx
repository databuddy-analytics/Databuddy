import { Button, Heading, Section, Text } from '@react-email/components';
import { EmailLayout } from './email-layout';

interface MagicLinkEmailProps {
	url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => {
	return (
		<EmailLayout preview="Log in to Databuddy">
			<Section className="my-6">
				<Heading className="text-center font-semibold text-2xl">
					Log in to Databuddy
				</Heading>
				<Text className="text-center">
					Click the button below to log in to your Databuddy account.
				</Text>
			</Section>
			<Section className="text-center">
				<Button
					className="rounded bg-brand px-5 py-3 text-center font-medium text-sm text-white"
					href={url}
				>
					Log in
				</Button>
			</Section>
			<Section className="my-6">
				<Text className="text-center">
					This link will expire in 24 hours. If you did not try to log in, you
					can safely ignore this email.
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

export default MagicLinkEmail;
