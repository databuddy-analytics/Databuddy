"use client";

import { LogoCarousel } from "./logo-carousel";

const logos = [
	{
		name: "BETTER-AUTH",
		src: "https://www.better-auth.com",
		style: "font-medium font-geist",
	},
	{ name: "Rivo", src: "https://rivo.gg", style: "font-bold font-barlow" },
	{ name: "Confinity", src: "https://www.confinity.com" },
	{ name: "Autumn", src: "https://useautumn.com", style: "font-bold" },
	{ name: "OpenCut", src: "https://opencut.app" },
	{ name: "Call", src: "https://joincall.co" },
	{ name: "Mail0", src: "https://0.email" },
	{ name: "ServerStats", src: "https://serverstats.bot" },
	{ name: "xpand", src: "https://xpandconf.com" },
	{ name: "oss.now", src: "https://oss.now/" },
	{ name: "Terabits", src: "https://www.terabits.xyz" },
	{ name: "Dione", src: "https://getdione.app" },
	{ name: "Kubiks", src: "https://kubiks.ai/" },
	{ name: "Lindra", src: "https://lindra.ai" },
	{ name: "Snowseo", src: "https://snowseo.com" },
	{ name: "inbound", src: "https://inbound.new/" },
	{ name: "Mantlz", src: "https://mantlz.com" },
].map((logo, i) => ({ id: i + 1, style: "font-semibold", ...logo }));

export const TrustedBy = () => (
	<div className="relative space-y-3 sm:space-y-4">
		<p className="text-center text-muted-foreground text-xs sm:text-sm">
			Trusted by teams worldwide
		</p>
		<div className="relative [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
			<LogoCarousel columns={5} logos={logos} />
		</div>
	</div>
);
