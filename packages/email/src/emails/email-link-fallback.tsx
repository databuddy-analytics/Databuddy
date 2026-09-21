import { Link, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";

interface EmailLinkFallbackProps {
	href: string;
}

export const EmailLinkFallback = ({ href }: EmailLinkFallbackProps) => (
	<Section
		className="mt-6 rounded p-4"
		style={{ backgroundColor: emailBrand.inset }}
	>
		<Text className="m-0 mb-2 text-xs" style={{ color: emailBrand.muted }}>
			Having trouble with the button? Copy and paste this link:
		</Text>
		<Link
			className="text-xs underline"
			href={href}
			style={{ color: emailBrand.coral, wordBreak: "break-all" }}
		>
			{href}
		</Link>
	</Section>
);
