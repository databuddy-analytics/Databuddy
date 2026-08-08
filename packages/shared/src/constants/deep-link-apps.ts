export const DEEP_LINK_APP_IDS = [
	"instagram",
	"tiktok",
	"youtube",
	"x",
	"spotify",
	"linkedin",
	"facebook",
	"whatsapp",
	"telegram",
] as const;

export type DeepLinkAppId = (typeof DEEP_LINK_APP_IDS)[number];

export interface DeepLinkApp {
	hostnames: string[];
	id: DeepLinkAppId;
	name: string;
	placeholder: string;
	resolveUri: (url: URL) => string | null;
}

const TRAILING_SLASH = /\/$/;
const NON_DIGITS = /\D/g;
const DIGITS_ONLY = /^\d+$/;

export const DEEP_LINK_APPS: readonly DeepLinkApp[] = [
	{
		id: "instagram",
		name: "Instagram",
		hostnames: ["instagram.com", "www.instagram.com", "instagr.am"],
		placeholder: "https://instagram.com/username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts[0] === "p" && parts[1]) {
				return `instagram://media?id=${parts[1]}`;
			}
			if (parts[0] === "reel" && parts[1]) {
				return `instagram://reels?id=${parts[1]}`;
			}
			if (parts[0] === "stories" && parts[1]) {
				return `instagram://story?username=${parts[1]}`;
			}
			if (parts.length === 1) {
				return `instagram://user?username=${parts[0]}`;
			}
			return null;
		},
	},
	{
		id: "tiktok",
		name: "TikTok",
		hostnames: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"],
		placeholder: "https://tiktok.com/@username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts[0]?.startsWith("@") && parts[1] === "video" && parts[2]) {
				return `snssdk1233://aweme/detail/${parts[2]}`;
			}
			if (parts[0]?.startsWith("@")) {
				return `snssdk1233://user/profile/${parts[0].slice(1)}`;
			}
			return null;
		},
	},
	{
		id: "youtube",
		name: "YouTube",
		hostnames: ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"],
		placeholder: "https://youtube.com/watch?v=VIDEO_ID",
		resolveUri: (url) => {
			if (url.hostname === "youtu.be") {
				const id = url.pathname.slice(1);
				return id ? `vnd.youtube://${id}` : null;
			}
			const v = url.searchParams.get("v");
			if (url.pathname === "/watch" && v) {
				return `vnd.youtube://${v}`;
			}
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts[0] === "shorts" && parts[1]) {
				return `vnd.youtube://${parts[1]}`;
			}
			if (parts[0]?.startsWith("@")) {
				return `vnd.youtube://www.youtube.com/${parts[0]}`;
			}
			if (parts[0] === "channel" && parts[1]) {
				return `vnd.youtube://www.youtube.com/channel/${parts[1]}`;
			}
			return null;
		},
	},
	{
		id: "x",
		name: "X",
		hostnames: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
		placeholder: "https://x.com/username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts.length === 3 && parts[1] === "status") {
				return `twitter://status?id=${parts[2]}`;
			}
			if (parts.length === 1) {
				return `twitter://user?screen_name=${parts[0]}`;
			}
			return null;
		},
	},
	{
		id: "spotify",
		name: "Spotify",
		hostnames: ["open.spotify.com"],
		placeholder: "https://open.spotify.com/track/TRACK_ID",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts.length >= 2) {
				return `spotify://${parts[0]}/${parts[1]}`;
			}
			return null;
		},
	},
	{
		id: "linkedin",
		name: "LinkedIn",
		hostnames: ["linkedin.com", "www.linkedin.com"],
		placeholder: "https://linkedin.com/in/username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts[0] === "in" && parts[1]) {
				return `linkedin://profile/${parts[1]}`;
			}
			if (parts[0] === "company" && parts[1]) {
				return `linkedin://company/${parts[1]}`;
			}
			if (parts[0] === "posts" || (parts[1] === "posts" && parts[2])) {
				return `linkedin://feed/update/${url.pathname}`;
			}
			return null;
		},
	},
	{
		id: "facebook",
		name: "Facebook",
		hostnames: [
			"facebook.com",
			"www.facebook.com",
			"fb.com",
			"www.fb.com",
			"m.facebook.com",
		],
		placeholder: "https://facebook.com/username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts.length === 1) {
				return `fb://profile/${parts[0]}`;
			}
			return `fb://facewebmodal/f?href=${encodeURIComponent(url.toString())}`;
		},
	},
	{
		id: "whatsapp",
		name: "WhatsApp",
		hostnames: ["wa.me", "api.whatsapp.com", "chat.whatsapp.com"],
		placeholder: "https://wa.me/1234567890",
		resolveUri: (url) => {
			if (url.hostname === "chat.whatsapp.com") {
				const code = url.pathname.slice(1);
				return code ? `whatsapp://invite/${code}` : null;
			}
			const phone = url.pathname.slice(1).replace(NON_DIGITS, "");
			const text = url.searchParams.get("text");
			if (phone) {
				return text
					? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`
					: `whatsapp://send?phone=${phone}`;
			}
			return null;
		},
	},
	{
		id: "telegram",
		name: "Telegram",
		hostnames: ["t.me", "telegram.me"],
		placeholder: "https://t.me/username",
		resolveUri: (url) => {
			const path = url.pathname.replace(TRAILING_SLASH, "");
			const parts = path.split("/").filter(Boolean);
			if (parts[0] === "joinchat" && parts[1]) {
				return `tg://join?invite=${parts[1]}`;
			}
			if (parts.length === 1) {
				return `tg://resolve?domain=${parts[0]}`;
			}
			if (parts.length === 2 && DIGITS_ONLY.test(parts[1])) {
				return `tg://resolve?domain=${parts[0]}&post=${parts[1]}`;
			}
			return null;
		},
	},
];

const APP_MAP = new Map<string, DeepLinkApp>(
	DEEP_LINK_APPS.map((app) => [app.id, app] as const)
);
const HOST_MAP = new Map(
	DEEP_LINK_APPS.flatMap((app) =>
		app.hostnames.map((hostname) => [hostname.toLowerCase(), app] as const)
	)
);

export function getDeepLinkApp(id: string): DeepLinkApp | undefined {
	return APP_MAP.get(id);
}

export function getDeepLinkAppByHostname(
	hostname: string
): DeepLinkApp | undefined {
	return HOST_MAP.get(hostname.toLowerCase());
}

function parseDeepLinkTarget(
	appId: string,
	targetUrl: string
): { app: DeepLinkApp; url: URL } | null {
	const app = getDeepLinkApp(appId);
	if (!app) {
		return null;
	}

	try {
		const url = new URL(targetUrl);
		if (
			url.protocol === "https:" &&
			getDeepLinkAppByHostname(url.hostname)?.id === app.id
		) {
			return { app, url };
		}
		return null;
	} catch {
		return null;
	}
}

export function isDeepLinkTarget(appId: string, targetUrl: string): boolean {
	return parseDeepLinkTarget(appId, targetUrl) !== null;
}

export function resolveDeepLink(
	appId: string,
	targetUrl: string
): string | null {
	const target = parseDeepLinkTarget(appId, targetUrl);
	if (!target) {
		return null;
	}
	try {
		return target.app.resolveUri(target.url);
	} catch {
		return null;
	}
}
