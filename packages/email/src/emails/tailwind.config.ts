import { pixelBasedPreset, type TailwindConfig } from "@react-email/components";
import { emailBrand } from "./email-brand";

export const emailTailwindConfig = {
	presets: [pixelBasedPreset],
	theme: {
		extend: {
			colors: {
				brand: emailBrand.amber,
				"brand-foreground": emailBrand.onAmber,
				background: emailBrand.background,
				card: emailBrand.card,
				border: emailBrand.border,
				muted: emailBrand.muted,
			},
		},
	},
} satisfies TailwindConfig;
