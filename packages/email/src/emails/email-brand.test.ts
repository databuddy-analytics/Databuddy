import { describe, expect, test } from "bun:test";
import { emailBrand } from "./email-brand";

function relativeLuminance(hex: string): number {
	const channels = [1, 3, 5].map((index) =>
		Number.parseInt(hex.slice(index, index + 2), 16)
	);
	const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
		const value = channel / 255;
		return value <= 0.039_28
			? value / 12.92
			: ((value + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);
	return (lighter + 0.05) / (darker + 0.05);
}

describe("email brand contrast", () => {
	test("link color meets WCAG AA for normal text on email surfaces", () => {
		expect(contrastRatio(emailBrand.coral, emailBrand.card)).toBeGreaterThanOrEqual(
			4.5
		);
		expect(
			contrastRatio(emailBrand.coral, emailBrand.background)
		).toBeGreaterThanOrEqual(4.5);
	});

	test("uses an email-client-safe raster logo", () => {
		expect(emailBrand.primaryLogoUrl).toEndWith(".png");
	});
});
