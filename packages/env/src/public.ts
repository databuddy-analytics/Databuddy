import { createConfig } from "./app";

export const publicConfig = createConfig({
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
	NEXT_PUBLIC_BASKET_URL: process.env.NEXT_PUBLIC_BASKET_URL,
	NEXT_PUBLIC_STATUS_URL: process.env.NEXT_PUBLIC_STATUS_URL,
	NODE_ENV: process.env.NODE_ENV,
});
