"use client";

import dynamic from "next/dynamic";

const Iridescence = dynamic(() => import("./Iridiscence"), { ssr: false });

export function IridescenceBackground() {
	return (
		<Iridescence
			amplitude={0.1}
			color={[0.1, 0.1, 0.1]}
			mouseReact={false}
			speed={0.5}
		/>
	);
}
