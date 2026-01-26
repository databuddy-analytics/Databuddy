"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PROTOCOL_REGEX = /^https?:\/\//;

export interface UtmParams {
	utm_source: string;
	utm_medium: string;
	utm_campaign: string;
	utm_content: string;
	utm_term: string;
}

interface UtmBuilderProps {
	value: UtmParams;
	onChange: (params: UtmParams) => void;
	baseUrl?: string;
}

const UTM_FIELDS = [
	{
		key: "utm_source" as const,
		label: "Source",
		placeholder: "google, newsletter, twitter…",
		description: "Where the traffic comes from",
	},
	{
		key: "utm_medium" as const,
		label: "Medium",
		placeholder: "cpc, email, social…",
		description: "Marketing medium",
	},
	{
		key: "utm_campaign" as const,
		label: "Campaign",
		placeholder: "spring-sale, product-launch…",
		description: "Campaign name",
	},
	{
		key: "utm_content" as const,
		label: "Content",
		placeholder: "banner-ad, text-link…",
		description: "Differentiate ads/links",
	},
	{
		key: "utm_term" as const,
		label: "Term",
		placeholder: "running+shoes…",
		description: "Paid search keywords",
	},
] as const;

export function parseUtmFromUrl(url: string): UtmParams {
	const params: UtmParams = {
		utm_source: "",
		utm_medium: "",
		utm_campaign: "",
		utm_content: "",
		utm_term: "",
	};

	try {
		const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
		for (const field of UTM_FIELDS) {
			params[field.key] = urlObj.searchParams.get(field.key) ?? "";
		}
	} catch {
		// Invalid URL, return empty params
	}

	return params;
}

export function appendUtmToUrl(url: string, params: UtmParams): string {
	// Check if any UTM params are set
	const hasUtm = Object.values(params).some((v) => v.trim());
	if (!hasUtm) {
		return url;
	}

	try {
		const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);

		// Remove existing UTM params first
		for (const field of UTM_FIELDS) {
			urlObj.searchParams.delete(field.key);
		}

		// Add new UTM params
		for (const field of UTM_FIELDS) {
			const value = params[field.key].trim();
			if (value) {
				urlObj.searchParams.set(field.key, value);
			}
		}

		// Return URL without the protocol if the original didn't have one
		if (!url.startsWith("http")) {
			return urlObj.toString().replace(PROTOCOL_REGEX, "");
		}

		return urlObj.toString();
	} catch {
		return url;
	}
}

export function stripUtmFromUrl(url: string): string {
	try {
		const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);

		for (const field of UTM_FIELDS) {
			urlObj.searchParams.delete(field.key);
		}

		// Return URL without the protocol if the original didn't have one
		if (!url.startsWith("http")) {
			return urlObj.toString().replace(PROTOCOL_REGEX, "");
		}

		return urlObj.toString();
	} catch {
		return url;
	}
}

export function UtmBuilder({ value, onChange, baseUrl }: UtmBuilderProps) {
	const previewUrl = useMemo(() => {
		if (!baseUrl) {
			return null;
		}
		return appendUtmToUrl(baseUrl, value);
	}, [baseUrl, value]);

	const handleFieldChange = (key: keyof UtmParams, fieldValue: string) => {
		onChange({
			...value,
			[key]: fieldValue,
		});
	};

	return (
		<div className="space-y-4">
			<p className="text-muted-foreground text-xs">
				Add campaign tracking parameters to your destination URL
			</p>

			<div className="grid gap-3">
				{UTM_FIELDS.map((field) => (
					<div className="grid gap-1.5" key={field.key}>
						<Label className="text-xs" htmlFor={field.key}>
							{field.label}
							<span className="ml-1 text-muted-foreground">({field.key})</span>
						</Label>
						<Input
							className="h-9"
							id={field.key}
							onChange={(e) => handleFieldChange(field.key, e.target.value)}
							placeholder={field.placeholder}
							value={value[field.key]}
						/>
					</div>
				))}
			</div>

			{previewUrl && previewUrl !== baseUrl && (
				<div className="space-y-1.5">
					<Label className="text-muted-foreground text-xs">Preview URL</Label>
					<div className="break-all rounded border bg-muted/30 p-2.5 font-mono text-xs">
						{previewUrl}
					</div>
				</div>
			)}
		</div>
	);
}
