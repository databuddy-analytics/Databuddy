import type { NextRequest } from "next/server";
import {
	handleTrackerScriptOptions,
	serveTrackerScript,
} from "@/lib/tracker-script";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
	return serveTrackerScript(request, "vitals.js");
}

export function OPTIONS(request: NextRequest) {
	return handleTrackerScriptOptions(request);
}
