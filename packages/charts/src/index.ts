import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { init } from "echarts";
import { buildChartOption, type ChartComponentPayload } from "./options";
import { CHART_THEMES, type ChartThemeName } from "./themes";

export type { ChartComponentPayload } from "./options";
export { CHART_THEMES, type ChartTheme, type ChartThemeName } from "./themes";

const FONTS_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"assets",
	"fonts"
);

const fontFiles = readdirSync(FONTS_DIR)
	.filter((file) => file.endsWith(".otf"))
	.map((file) => join(FONTS_DIR, file));

export const CHARTABLE_COMPONENT_TYPES: ReadonlySet<string> = new Set([
	"line-chart",
	"area-chart",
	"bar-chart",
	"stacked-bar-chart",
	"pie-chart",
	"donut-chart",
]);

export function isChartableComponent(type: string): boolean {
	return CHARTABLE_COMPONENT_TYPES.has(type);
}

export interface RenderChartOptions {
	height?: number;
	scale?: number;
	subtitle?: string;
	theme?: ChartThemeName;
	width?: number;
}

export function renderChartPng(
	component: ChartComponentPayload,
	options: RenderChartOptions = {}
): Buffer | null {
	const width = options.width ?? 1200;
	const height = options.height ?? 630;
	const theme = CHART_THEMES[options.theme ?? "dark"];
	const chartOption = buildChartOption(component, theme, {
		width,
		height,
		subtitle: options.subtitle,
	});
	if (!chartOption) {
		return null;
	}

	const chart = init(null, null, {
		renderer: "svg",
		ssr: true,
		width,
		height,
	});
	try {
		chart.setOption(chartOption);
		const svg = chart.renderToSVGString();
		const resvg = new Resvg(svg, {
			fitTo: { mode: "width", value: width * (options.scale ?? 2) },
			font: {
				fontFiles,
				defaultFontFamily: "LT Superior",
				loadSystemFonts: false,
			},
		});
		return Buffer.from(resvg.render().asPng());
	} finally {
		chart.dispose();
	}
}
