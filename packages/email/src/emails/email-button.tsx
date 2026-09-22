import { Button } from "@react-email/components";
import { emailBrand } from "./email-brand";

interface EmailButtonProps {
	children: React.ReactNode;
	href: string;
}

export const EmailButton = ({ href, children }: EmailButtonProps) => (
	<Button
		className="box-border rounded bg-brand px-6 py-3 text-center font-semibold text-brand-foreground text-sm"
		href={href}
		style={{
			backgroundColor: emailBrand.amber,
			color: emailBrand.onAmber,
		}}
	>
		{children}
	</Button>
);
