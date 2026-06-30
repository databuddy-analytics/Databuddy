import { hash } from "bun";

export function getContentHash(content: string): string {
	return hash(content).toString();
}

export async function generateSriHash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-384", data);
	const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
	return `sha384-${base64}`;
}

export function versionedName(filename: string, version: number): string {
	const dot = filename.lastIndexOf(".");
	return `${filename.slice(0, dot)}.v${version}${filename.slice(dot)}`;
}

export const PRODUCTION_SCRIPTS = ["databuddy.js", "vitals.js", "errors.js"];
