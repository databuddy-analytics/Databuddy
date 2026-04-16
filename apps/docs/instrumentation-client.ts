import { initBotId } from "botid/client/core";

initBotId({
	protect: [
		{ path: "/api/newsletter/subscribe", method: "POST" },
		{ path: "/api/contact/submit", method: "POST" },
		{ path: "/api/ambassador/submit", method: "POST" },
		{ path: "/api/oss/submit", method: "POST" },
	],
});
