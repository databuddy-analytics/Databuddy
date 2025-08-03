import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Preview,
	Tailwind,
	Text,
} from '@react-email/components';

interface EmailLayoutProps {
	preview: string;
	children: React.ReactNode;
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => {
	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								brand: '#7a42ff',
								background: '#212124',
								foreground: '#f2f2f2',
								card: '#2d2d30',
								'card-foreground': '#f2f2f2',
								border: '#636369',
								muted: '#b3b3b3',
								'muted-foreground': '#b3b3b3',
							},
						},
					},
				}}
			>
				<Body className="bg-background font-sans text-foreground">
					<Container className="mx-auto my-8 w-[465px] rounded border border-border border-solid bg-card p-5">
						{children}
						<Hr className="my-6 w-full border border-border border-solid" />
						<Text className="text-center text-muted-foreground">
							© {new Date().getFullYear()} Databuddy, Inc. All rights reserved.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};
