import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const databuddyFontFamily = "LT Superior";

export const fontsReady = Promise.all([
	loadFont({
		family: databuddyFontFamily,
		url: staticFile("lt-superior-regular.woff2"),
		weight: "400",
	}),
	loadFont({
		family: databuddyFontFamily,
		url: staticFile("lt-superior-medium.woff2"),
		weight: "500",
	}),
	loadFont({
		family: databuddyFontFamily,
		url: staticFile("lt-superior-semibold.woff2"),
		weight: "600",
	}),
	loadFont({
		family: databuddyFontFamily,
		url: staticFile("lt-superior-bold.woff2"),
		weight: "700",
	}),
]);
