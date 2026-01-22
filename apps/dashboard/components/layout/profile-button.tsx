import { auth } from"@databuddy/auth";
import { headers } from"next/headers";
import { ProfileButtonClient } from"./profile-button-client";

export async function ProfileButton() {
	const headersList = await headers();
	const session = await auth.api.getSession({
		headers: headersList,
	});

	const user = session?.user || {
		name: null,
		email: null,
		image: null,
	};

	return <ProfileButtonClient user={user} />;
}
