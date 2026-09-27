import { Hr, Link, Section, Text } from "@react-email/components";
import { emailBrand } from "./email-brand";

export const EmailFooter = () => (
	<Section className="mt-8">
		<Hr
			className="border-border border-solid"
			style={{ borderColor: emailBrand.border }}
		/>
		<Text
			className="m-0 mb-2 text-center text-xs"
			style={{ color: emailBrand.muted }}
		>
			<Link
				href="https://www.databuddy.cc"
				style={{ color: emailBrand.muted, textDecoration: "underline" }}
			>
				Website
			</Link>
			{" · "}
			<Link
				href="https://www.databuddy.cc/docs"
				style={{ color: emailBrand.muted, textDecoration: "underline" }}
			>
				Docs
			</Link>
			{" · "}
			<Link
				href="https://twitter.com/trydatabuddy"
				style={{ color: emailBrand.muted, textDecoration: "underline" }}
			>
				Twitter
			</Link>
		</Text>
		<Text
			className="m-0 text-center text-xs"
			style={{ color: emailBrand.muted }}
		>
			© {new Date().getFullYear()} Databuddy, Inc. All rights reserved.
		</Text>
	</Section>
);
