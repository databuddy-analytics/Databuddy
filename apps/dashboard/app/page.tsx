import { auth } from "@databuddy/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
	const headersList = await headers();
	const session = await auth.api.getSession({
		headers: headersList,
	});

	if (session?.user) {
		redirect("/websites");
	} else {
		redirect("/login");
	}
}
