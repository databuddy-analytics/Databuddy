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
import { emailTailwindConfig } from "./tailwind.config";

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
	<Html lang="en">
		<Tailwind config={emailTailwindConfig}>
			<Head>
				<meta content="width=device-width, initial-scale=1.0" name="viewport" />
				<meta content="dark" name="color-scheme" />
				<meta content="dark" name="supported-color-schemes" />
			</Head>
			<Body
				className="m-0 bg-background font-sans"
				style={{ backgroundColor: emailBrand.background }}
			>
				<Preview>{preview}</Preview>
				<Container
					className="mx-auto my-10 max-w-[520px] px-4"
					style={{ backgroundColor: emailBrand.background }}
				>
					<EmailHeader tagline={tagline} />
					<Section
						className="rounded border border-border border-solid bg-card px-8 py-6"
						style={{
							backgroundColor: emailBrand.card,
							borderColor: emailBrand.border,
						}}
					>
						{children}
					</Section>
					<EmailFooter />
				</Container>
			</Body>
		</Tailwind>
	</Html>
);
