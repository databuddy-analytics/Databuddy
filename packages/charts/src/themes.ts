export interface ChartTheme {
	background: string;
	border: string;
	foreground: string;
	muted: string;
	palette: readonly [string, string, string, string, string];
}

export type ChartThemeName = "dark" | "light";

export const CHART_THEMES: Record<ChartThemeName, ChartTheme> = {
	dark: {
		background: "#1e1e23",
		foreground: "#e7e8eb",
		muted: "#a3a4ab",
		border: "#3b3b45",
		palette: ["#8b80bf", "#d4658a", "#f0ba4d", "#4db8e8", "#4ebf7b"],
	},
	light: {
		background: "#ffffff",
		foreground: "#27282d",
		muted: "#71727a",
		border: "#d1d3dc",
		palette: ["#6b5ca5", "#b74677", "#e3a514", "#2d9cdb", "#27ae60"],
	},
};
