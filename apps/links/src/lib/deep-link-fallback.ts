const FALLBACK_DELAY_MS = 1500;

const HTML_ESCAPES: Record<string, string> = {
	'"': "&quot;",
	"&": "&amp;",
	"'": "&#39;",
	"<": "&lt;",
	">": "&gt;",
};

const SCRIPT_ESCAPES: Record<string, string> = {
	"&": "\\u0026",
	"<": "\\u003c",
	">": "\\u003e",
	"\u2028": "\\u2028",
	"\u2029": "\\u2029",
};

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function serializeForScript(value: string): string {
	return JSON.stringify(value).replace(
		/[<>&\u2028\u2029]/g,
		(character) => SCRIPT_ESCAPES[character]
	);
}

export function renderDeepLinkFallbackPage(
	deepUrl: string,
	fallbackUrl: string
): string {
	const appUrl = serializeForScript(deepUrl);
	const fallback = serializeForScript(fallbackUrl);
	const safeDeepUrl = escapeHtml(deepUrl);
	const safeFallbackUrl = escapeHtml(fallbackUrl);

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="2;url=${safeFallbackUrl}">
  <title>Opening app…</title>
</head>
<body>
  <main>
    <p>Opening the app…</p>
    <p><a href="${safeDeepUrl}">Open app</a></p>
    <p><a href="${safeFallbackUrl}">Continue in your browser</a></p>
  </main>
  <script>
    const appUrl = ${appUrl};
    const fallbackUrl = ${fallback};
    const timer = window.setTimeout(() => window.location.replace(fallbackUrl), ${FALLBACK_DELAY_MS});
    const cancelFallback = () => window.clearTimeout(timer);
    window.addEventListener("pagehide", cancelFallback, { once: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") cancelFallback();
    });
    window.location.href = appUrl;
  </script>
</body>
</html>`;
}

export function createDeepLinkFallbackResponse(
	deepUrl: string,
	fallbackUrl: string
): Response {
	return new Response(renderDeepLinkFallbackPage(deepUrl, fallbackUrl), {
		headers: {
			"Cache-Control": "private, no-store",
			"Content-Type": "text/html; charset=utf-8",
		},
	});
}
