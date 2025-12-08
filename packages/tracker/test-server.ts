import { join } from "node:path";
import { file as BunFile, serve } from "bun";

const PORT = 3033;
const BASE_DIR = import.meta.dir;

serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);
		console.log(`[Test Server] Request: ${req.method} ${url.pathname}`);

		if (url.pathname === "/test") {
			return new Response(
				`<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Databuddy Test Page</title>
                </head>
                <body>
                    <h1>Test Page</h1>
                    <p>Some content to trigger vitals</p>
                </body>
                </html>`,
				{
					headers: { "Content-Type": "text/html" },
				}
			);
		}

		if (url.pathname === "/") {
			return new Response(
				`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Databuddy Tracker Test Suite</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <script>
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      bg: '#0f172a',
                      card: '#1e293b',
                      primary: '#3b82f6',
                      danger: '#ef4444',
                      success: '#22c55e',
                    }
                  }
                }
              }
            </script>
            <style>
              body {
                background-color: #0f172a;
                color: #f8fafc;
              }
              pre {
                background: #000;
              }
            </style>
            <script 
                src="/dist/databuddy-debug.js" 
                data-api-url="http://localhost:4000"
                data-client-id="dev-test-id"
                data-track-errors="true"
                data-track-web-vitals="true"
                data-track-attributes="true"
            ></script>
          </head>
          <body class="max-w-5xl mx-auto p-8 antialiased">
            <div class="flex justify-between items-center mb-8">
                <h1 class="text-3xl font-bold flex items-center gap-3">
                    <span>🔍</span> Databuddy Tracker Test
                </h1>
                <div id="statusIndicator" class="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-slate-700">
                    <span class="w-3 h-3 rounded-full bg-green-500"></span>
                    <span id="statusText" class="font-medium">Tracking Active</span>
                </div>
            </div>

            <p class="mb-8 text-slate-400 bg-card p-4 rounded-lg border border-slate-700 flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                </svg>
                Open your browser console (F12) to see debug logs and network requests.
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="bg-card p-6 rounded-xl border border-slate-700 shadow-lg hover:border-blue-500/50  ">
                    <h2 class="text-xl font-semibold mb-4 text-blue-400 flex items-center gap-2">
                        <span>🖱️</span> Events
                    </h2>
                    <div class="space-y-3">
                        <button class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left flex justify-between group" onclick="databuddy.track('test_click', { button: 'primary' })">
                            Track Custom Event
                            <span class="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                        </button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="databuddy.track('purchase', { amount: 99.99, currency: 'USD' })">Track Purchase</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="databuddy.track('signup', { method: 'email' })">Track Signup</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" data-track="auto_click" data-custom-attr="123">Auto-Track Attribute Click</button>
                    </div>
                </div>

                <div class="bg-card p-6 rounded-xl border border-slate-700 shadow-lg hover:border-red-500/50  ">
                    <h2 class="text-xl font-semibold mb-4 text-red-400 flex items-center gap-2">
                        <span>⚠️</span> Errors
                    </h2>
                    <div class="space-y-3">
                        <button class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="throwError()">Throw Uncaught Error</button>
                        <button class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="throwPromise()">Unhandled Promise Rejection</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="databuddy.track('error_log', { error: 'manual' })">Track Manual Error</button>
                    </div>
                </div>

                <div class="bg-card p-6 rounded-xl border border-slate-700 shadow-lg hover:border-yellow-500/50  ">
                    <h2 class="text-xl font-semibold mb-4 text-yellow-400 flex items-center gap-2">
                        <span>⚡</span> Web Vitals
                    </h2>
                    <p class="text-sm text-slate-400 mb-4">Vitals are captured automatically. Triggers on page hide.</p>
                    <div class="space-y-3">
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="location.reload()">Reload Page (FCP/LCP)</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="simulateCLS()">Simulate CLS</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="simulateLongTask()">Simulate Long Task (INP)</button>
                    </div>
                </div>

                <div class="bg-card p-6 rounded-xl border border-slate-700 shadow-lg hover:border-purple-500/50  ">
                    <h2 class="text-xl font-semibold mb-4 text-purple-400 flex items-center gap-2">
                        <span>🛡️</span> Privacy & State
                    </h2>
                    <div class="space-y-3">
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="toggleOptOut()">Toggle Opt-Out</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="checkState()">Log Current State</button>
                        <button class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg transition-all font-medium text-left" onclick="history.pushState({}, '', '/new-path?q=test');">Simulate Navigation</button>
                    </div>
                </div>
            </div>

            <div class="mt-8 bg-card rounded-xl border border-slate-700 shadow-lg overflow-hidden">
                <div class="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                    <h2 class="text-lg font-semibold flex items-center gap-2">
                        <span>📜</span> Recent Activity <span class="text-slate-400 text-sm font-normal">(Console Mirror)</span>
                    </h2>
                    <button onclick="document.getElementById('consoleLog').innerText = '// Logs will appear here...'" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded">Clear</button>
                </div>
                <pre id="consoleLog" class="p-4 font-mono text-xs md:text-sm text-green-400 h-64 overflow-y-auto scroll-smooth">// Logs will appear here...</pre>
            </div>

            <script>
                // Error Helpers
                function throwError() {
                    throw new Error("Test error triggered from UI at " + new Date().toLocaleTimeString());
                }
                
                function throwPromise() {
                    Promise.reject(new Error("Test promise rejection at " + new Date().toLocaleTimeString()));
                }

                // Vitals Helpers
                function simulateCLS() {
                    const div = document.createElement('div');
                    div.className = "fixed top-0 left-0 w-full h-48 bg-orange-500/90 z-50 flex items-center justify-center text-2xl font-bold shadow-2xl transition-all duration-300";
                    div.innerText = '⚠️ Layout Shift!';
                    document.body.prepend(div);
                    setTimeout(() => div.remove(), 1000);
                }

                function simulateLongTask() {
                    const start = Date.now();
                    const btn = event.target;
                    const originalText = btn.innerText;
                    btn.innerText = "Blocking thread...";
                    btn.classList.add("bg-red-600");
                    
                    setTimeout(() => {
                        while (Date.now() - start < 300) {
                            // Block main thread for 300ms
                        }
                        console.log("Long task finished");
                        btn.innerText = originalText;
                        btn.classList.remove("bg-red-600");
                    }, 10);
                }

                // State Helpers
                function updateStatus() {
                    const isOptedOut = localStorage.getItem("databuddy_opt_out") === "true";
                    const indicator = document.querySelector("#statusIndicator span:first-child");
                    const text = document.getElementById("statusText");
                    
                    if (isOptedOut) {
                        indicator.className = "w-3 h-3 rounded-full bg-red-500";
                        text.innerText = "Opted Out (Tracking Disabled)";
                    } else {
                        indicator.className = "w-3 h-3 rounded-full bg-green-500";
                        text.innerText = "Tracking Active";
                    }
                }

                function toggleOptOut() {
                    if (localStorage.getItem("databuddy_opt_out") === "true") {
                        databuddyOptIn();
                    } else {
                        databuddyOptOut();
                    }
                    updateStatus();
                    checkState();
                }

                function checkState() {
                    console.log("Current Config:", databuddy?.options);
                    console.log("Anonymous ID:", localStorage.getItem("did"));
                    console.log("Session ID:", sessionStorage.getItem("did_session"));
                }

                // Console Mirror
                const originalLog = console.log;
                const pre = document.getElementById('consoleLog');
                
                function appendLog(args, type = '') {
                    const text = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
                    pre.innerText = \`[\${new Date().toLocaleTimeString()}] \${type} \${text}\\n\` + pre.innerText;
                }

                console.log = (...args) => {
                    originalLog.apply(console, args);
                    if (args[0]?.toString().includes('[Databuddy]')) {
                        appendLog(args);
                    }
                };

                updateStatus();
            </script>
          </body>
        </html>
      `,
				{
					headers: { "Content-Type": "text/html" },
				}
			);
		}

		if (url.pathname.startsWith("/dist/")) {
			const filePath = join(BASE_DIR, url.pathname);
			console.log(`[Test Server] Serving file: ${filePath}`);
			const file = BunFile(filePath);
			if (await file.exists()) {
				return new Response(file);
			}
			console.error(`[Test Server] File not found: ${filePath}`);
			return new Response(`File not found: ${filePath}`, { status: 404 });
		}

		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Test server running on http://localhost:${PORT}`);
