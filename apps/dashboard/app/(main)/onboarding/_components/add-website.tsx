"use client";

import { Button, Field, Input } from "@databuddy/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

const domainRegex =
	/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const wwwRegex = /^www\./;
const nameSeparators = /[-_]+/g;
const disallowedNameCharacters = /[^a-zA-Z0-9\s\-_.]/g;
const whitespace = /\s+/;

const formSchema = z.object({
	domain: z
		.string()
		.min(1, "Enter your website's domain")
		.regex(domainRegex, "Enter a domain like acme.com"),
	name: z
		.string()
		.trim()
		.min(1, "Name is required")
		.max(100, "Keep the name under 100 characters")
		.regex(/^[a-zA-Z0-9\s\-_.]+$/, "Use letters, numbers, spaces, -, _ or ."),
});

export type WebsiteFormValues = z.infer<typeof formSchema>;

function normalizeDomainInput(value: string): string {
	let domain = value.trim();
	if (domain.startsWith("http://") || domain.startsWith("https://")) {
		try {
			domain = new URL(domain).hostname;
		} catch {
			return domain;
		}
	}
	return domain.replace(wwwRegex, "").split("/")[0] ?? "";
}

function websiteNameFromDomain(domain: string): string {
	const label = domain.split(".")[0] ?? "";
	return label
		.replace(nameSeparators, " ")
		.replace(disallowedNameCharacters, "")
		.trim()
		.split(whitespace)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

interface AddWebsiteProps {
	onCreate: (values: WebsiteFormValues) => Promise<void>;
	pending: boolean;
	suggestedDomain: string | null;
}

export function AddWebsite({
	onCreate,
	pending,
	suggestedDomain,
}: AddWebsiteProps) {
	const form = useForm<WebsiteFormValues>({
		resolver: zodResolver(formSchema),
		mode: "onChange",
		defaultValues: {
			domain: suggestedDomain ?? "",
			name: suggestedDomain ? websiteNameFromDomain(suggestedDomain) : "",
		},
	});
	const domainField = useController({ control: form.control, name: "domain" });
	const nameField = useController({ control: form.control, name: "name" });

	return (
		<form
			className="max-w-xl space-y-3"
			onSubmit={form.handleSubmit((values) =>
				onCreate({ domain: values.domain, name: values.name.trim() })
			)}
		>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
				<Field error={!!domainField.fieldState.error}>
					<Field.Label>Domain</Field.Label>
					<Input
						autoCapitalize="none"
						autoComplete="url"
						autoCorrect="off"
						autoFocus
						inputMode="url"
						placeholder="acme.com"
						prefix="https://"
						spellCheck={false}
						{...domainField.field}
						onChange={(event) => {
							const domain = normalizeDomainInput(event.target.value);
							domainField.field.onChange(domain);
							if (!nameField.fieldState.isDirty) {
								form.setValue("name", websiteNameFromDomain(domain), {
									shouldValidate: domain.length > 0,
								});
							}
						}}
					/>
					{domainField.fieldState.error ? (
						<Field.Error>{domainField.fieldState.error.message}</Field.Error>
					) : suggestedDomain && domainField.field.value === suggestedDomain ? (
						<Field.Description>From your email address</Field.Description>
					) : null}
				</Field>
				<Field error={!!nameField.fieldState.error}>
					<Field.Label>Name</Field.Label>
					<Input placeholder="Acme" {...nameField.field} />
					{nameField.fieldState.error ? (
						<Field.Error>{nameField.fieldState.error.message}</Field.Error>
					) : null}
				</Field>
			</div>
			<Button
				disabled={!form.formState.isValid}
				loading={pending}
				size="sm"
				type="submit"
			>
				{pending ? "Creating" : "Create website"}
			</Button>
		</form>
	);
}
