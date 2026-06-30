"use client";

import { getTrackingParams } from "@databuddy/sdk";
import { MARKETING_PARAM_KEYS } from "@databuddy/shared/custom-events";
import { useEffect } from "react";

const REGISTER_URL = "https://app.databuddy.cc/register";
const STORAGE_KEY = "databuddy_marketing_params";

function getMarketingParams() {
	const params = new URLSearchParams(localStorage.getItem(STORAGE_KEY) ?? "");
	const search = new URLSearchParams(window.location.search);
	let changed = false;

	for (const key of MARKETING_PARAM_KEYS) {
		const value = search.get(key)?.trim().slice(0, 160);
		if (value) {
			params.set(key, value);
			changed = true;
		}
	}

	if (changed) {
		localStorage.setItem(STORAGE_KEY, params.toString());
	}
	return params;
}

function decorateLink(link: HTMLAnchorElement, params: URLSearchParams) {
	const url = new URL(link.href);
	if (url.origin + url.pathname !== REGISTER_URL) {
		return;
	}

	for (const [key, value] of params) {
		url.searchParams.set(key, value);
	}
	for (const [key, value] of new URLSearchParams(getTrackingParams())) {
		url.searchParams.set(key, value);
	}
	link.href = url.toString();
}

export function RegisterAttribution() {
	useEffect(() => {
		const params = getMarketingParams();
		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			const link = target.closest<HTMLAnchorElement>("a[href]");
			if (link) {
				decorateLink(link, params);
			}
		};

		for (const link of document.querySelectorAll<HTMLAnchorElement>(
			`a[href^="${REGISTER_URL}"]`
		)) {
			decorateLink(link, params);
		}
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, []);

	return null;
}
