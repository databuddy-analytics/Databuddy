import { createScript, isScriptInjected } from "@/core/script";
import type { DatabuddyConfig } from "@/core/types";
import { detectClientId } from "@/utils";

/**
 * React/Next.js component that injects the Databuddy tracking script.
 * Place this in your root layout or `_app.tsx`. Renders nothing to the DOM.
 *
 * Auto-detects `clientId` from `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` env var if not provided.
 *
 * @param props - Configuration options for the tracker
 *
 * @example
 * ```tsx
 * // app/layout.tsx (Next.js App Router)
 * import { Databuddy } from "@databuddy/sdk/react";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <Databuddy
 *           apiUrl="https://basket.databuddy.cc"
 *           trackWebVitals
 *           trackErrors
 *         />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With explicit clientId
 * <Databuddy
 *   clientId="your-client-id"
 *   trackWebVitals
 *   trackScrollDepth
 *   trackOutgoingLinks
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Disable in development
 * <Databuddy
 *   disabled={process.env.NODE_ENV === "development"}
 *   trackWebVitals
 * />
 * ```
 */
export function Databuddy(props: DatabuddyConfig) {
	const clientId = detectClientId(props.clientId);

	if (!clientId) {
		if (typeof window !== "undefined" && !props.disabled && props.debug) {
			console.warn(
				"Databuddy: No client ID found. Please provide clientId prop or set NEXT_PUBLIC_DATABUDDY_CLIENT_ID environment variable."
			);
		}
		return null;
	}

	if (typeof window !== "undefined" && !props.disabled && !isScriptInjected()) {
		const script = createScript({ ...props, clientId });
		document.head.appendChild(script);
	}

	return null;
}
