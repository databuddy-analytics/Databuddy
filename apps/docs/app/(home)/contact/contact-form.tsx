"use client";

import { getTrackingIds } from "@databuddy/sdk/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PaperPlaneIcon, SpinnerIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { isValidPhoneNumber } from "react-phone-number-input";
import { toast } from "sonner";
import { z } from "zod";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "./phone-input";

const URL_TLD_REGEX = /\.[a-z]{2,}$/i;

const contactSchema = z.object({
	fullName: z
		.string()
		.min(1, "Full name is required")
		.min(2, "Name must be at least 2 characters")
		.max(100, "Name is too long"),
	businessName: z
		.string()
		.min(1, "Business or website name is required")
		.min(2, "Must be at least 2 characters")
		.max(200, "Name is too long"),
	website: z
		.string()
		.min(1, "Website is required")
		.max(500, "URL is too long")
		.refine((val) => {
			const raw = val.trim();
			if (!raw) {
				return false;
			}
			const url =
				raw.startsWith("http") || raw.startsWith("//") ? raw : `https://${raw}`;
			try {
				const parsed = new URL(url);
				return (
					parsed.hostname.includes(".") && URL_TLD_REGEX.test(parsed.hostname)
				);
			} catch {
				return false;
			}
		}, "Enter a valid website (e.g. example.com)"),
	email: z
		.string()
		.min(1, "Email is required")
		.email("Enter a valid email address")
		.max(255, "Email is too long"),
	phone: z.string().refine(
		(val) => {
			if (!val.trim()) {
				return true;
			}
			return isValidPhoneNumber(val);
		},
		{ message: "Enter a valid phone number" }
	),
});

type ContactFormValues = z.infer<typeof contactSchema>;

function FormField({
	id,
	label,
	required = false,
	children,
	description,
	error,
}: {
	id: string;
	label: string;
	required?: boolean;
	children: React.ReactNode;
	description?: string;
	error?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-foreground text-sm" htmlFor={id}>
				{label}
				{required ? <span className="ml-1 text-destructive">*</span> : null}
			</Label>
			{children}
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
			{description && !error ? (
				<p className="text-muted-foreground text-xs">{description}</p>
			) : null}
		</div>
	);
}

export default function ContactForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		control,
		formState: { errors },
	} = useForm<ContactFormValues>({
		resolver: zodResolver(contactSchema),
		defaultValues: {
			fullName: "",
			businessName: "",
			website: "",
			email: "",
			phone: "",
		},
	});

	const submitForm = async (data: ContactFormValues) => {
		setIsSubmitting(true);
		const { anonId, sessionId } = getTrackingIds();

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30_000);

			const response = await fetch("/api/contact/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...data,
					anonId,
					sessionId,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			let responseData: Record<string, unknown>;
			try {
				responseData = (await response.json()) as Record<string, unknown>;
			} catch {
				throw new Error("Invalid response from server. Please try again.");
			}

			if (!response.ok) {
				if (response.status === 429) {
					const resetTime = responseData.resetTime
						? new Date(String(responseData.resetTime)).toLocaleTimeString()
						: "soon";
					throw new Error(
						`Too many submissions. Please try again after ${resetTime}.`
					);
				}

				if (response.status === 400 && responseData.details) {
					const errorMessage = Array.isArray(responseData.details)
						? (responseData.details as string[]).join("\n• ")
						: String(responseData.error || "Validation failed");
					throw new Error(`Please fix the following:\n• ${errorMessage}`);
				}

				throw new Error(
					String(responseData.error || "Submission failed. Please try again.")
				);
			}

			toast.success("Message sent!", {
				description: "We'll get back to you as soon as possible.",
				duration: 5000,
			});
			router.push("/contact/thanks");
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					toast.error(
						"Request timed out. Please check your connection and try again."
					);
				} else {
					const errorLines = error.message.split("\n");
					if (errorLines.length > 1) {
						toast.error(errorLines.at(0), {
							description: errorLines.slice(1).join("\n"),
							duration: 5000,
						});
					} else {
						toast.error(error.message);
					}
				}
			} else {
				toast.error("Failed to submit. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SciFiCard className="rounded border border-border bg-card/50 p-5 backdrop-blur-sm sm:p-6">
			<form
				autoComplete="off"
				className="space-y-4"
				onSubmit={handleSubmit(submitForm)}
			>
				<FormField
					error={errors.fullName?.message}
					id="full-name"
					label="Full Name"
					required
				>
					<Input
						aria-invalid={!!errors.fullName}
						autoComplete="off"
						className={errors.fullName ? "border-destructive" : ""}
						id="full-name"
						maxLength={100}
						placeholder="Jane Doe"
						type="text"
						{...register("fullName")}
					/>
				</FormField>

				<FormField
					error={errors.businessName?.message}
					id="business-name"
					label="Business or Website Name"
					required
				>
					<Input
						aria-invalid={!!errors.businessName}
						autoComplete="off"
						className={errors.businessName ? "border-destructive" : ""}
						id="business-name"
						maxLength={200}
						placeholder="Acme Inc. or acme.com"
						type="text"
						{...register("businessName")}
					/>
				</FormField>

				<FormField
					error={errors.website?.message}
					id="domain"
					label="Website"
					required
				>
					<Input
						aria-invalid={!!errors.website}
						autoComplete="off"
						className={errors.website ? "border-destructive" : ""}
						id="domain"
						maxLength={500}
						placeholder="example.com"
						type="text"
						{...register("website")}
					/>
				</FormField>

				<FormField
					error={errors.email?.message}
					id="email"
					label="Contact Email"
					required
				>
					<Input
						aria-invalid={!!errors.email}
						autoComplete="off"
						className={errors.email ? "border-destructive" : ""}
						id="email"
						maxLength={255}
						placeholder="jane@acme.com"
						type="email"
						{...register("email")}
					/>
				</FormField>

				<FormField
					description="Optional — we'll only call if needed"
					error={errors.phone?.message}
					id="phone"
					label="Phone Number"
				>
					<Controller
						control={control}
						name="phone"
						render={({ field }) => (
							<PhoneInput
								error={!!errors.phone}
								id="phone"
								onChangeAction={(val) => field.onChange(val)}
								value={field.value}
							/>
						)}
					/>
				</FormField>

				<div className="pt-2">
					<SciFiButton
						aria-label={isSubmitting ? "Sending message" : "Send message"}
						className="w-full"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? (
							<>
								<SpinnerIcon className="size-4 animate-spin" />
								Sending...
							</>
						) : (
							<>
								<PaperPlaneIcon className="size-4" weight="duotone" />
								Send Message
							</>
						)}
					</SciFiButton>
				</div>
			</form>
		</SciFiCard>
	);
}
