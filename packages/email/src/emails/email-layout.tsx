import {
	Body,
	Container,
	Head,
	Html,
	Preview,
	Section,
	Tailwind,
} from "@react-email/components";
import { emailBrand } from "./email-brand";
import { EmailFooter } from "./email-footer";
import { EmailHeader } from "./email-header";

interface EmailLayoutProps {
	children: React.ReactNode;
	preview: string;
	tagline?: string;
}

export const EmailLayout = ({
	preview,
	tagline,
	children,
}: EmailLayoutProps) => (
	<Html>
		<Head>
			<meta content="width=device-width, initial-scale=1.0" name="viewport" />
		</Head>
		<Preview>{preview}</Preview>
		<Tailwind
			config={{
				theme: {
					extend: {
						colors: {
							brand: emailBrand.amber,
							"brand-foreground": emailBrand.onAmber,
							background: emailBrand.background,
							card: emailBrand.card,
							foreground: emailBrand.foreground,
							"card-foreground": emailBrand.foreground,
							border: emailBrand.border,
							muted: emailBrand.muted,
							"muted-foreground": emailBrand.muted,
						},
					},
				},
			}}
		>
			<Body className="m-0 bg-background font-sans">
				<Container className="mx-auto my-10 max-w-[520px] px-4">
					<EmailHeader tagline={tagline} />
					<Section
						className="rounded bg-card px-8 py-6"
						style={{ border: `1px solid ${emailBrand.border}` }}
					>
						{children}
					</Section>
					<EmailFooter />
				</Container>
			</Body>
		</Tailwind>
	</Html>
);
