"use client";

import { track } from "@databuddy/sdk";
import { useEffect, useRef } from "react";

interface TrackOnMountProps {
	event: string;
	properties?: Record<string, string | number | boolean>;
}

export function TrackOnMount({ event, properties }: TrackOnMountProps) {
	const fired = useRef(false);

	useEffect(() => {
		if (fired.current) {
			return;
		}
		fired.current = true;
		track(event, properties);
	}, [event, properties]);

	return null;
}
