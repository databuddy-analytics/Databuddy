import { Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";

interface EmailNoteProps {
	children: React.ReactNode;
}

export const EmailNote = ({ children }: EmailNoteProps) => (
	<Section className="mt-8">
		<Text
			className="m-0 text-center text-xs leading-relaxed"
			style={{ color: emailBrand.muted }}
		>
			{children}
		</Text>
	</Section>
);
