"use client";

import { track } from "@databuddy/sdk";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, PaperPlaneIcon, SpinnerIcon } from "@databuddy/ui/icons";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const FUNDING = [
	"Bootstrapped",
	"Under $1M",
	"$1M to $5M",
	"More than $5M",
] as const;

const ACCELERATORS = [
	"Not in one",
	"Y Combinator",
	"Techstars",
	"Antler",
	"500 Global",
	"Entrepreneur First",
	"a16z Speedrun",
	"Other",
] as const;

const startupsSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.min(2, "Name must be at least 2 characters")
		.max(100, "Name is too long"),
	email: z
		.string()
		.min(1, "Email is required")
		.email("Enter a valid email")
		.max(255, "Email is too long"),
	companyName: z
		.string()
		.min(1, "Company name is required")
		.max(120, "Company name is too long"),
	website: z
		.string()
		.min(1, "Website is required")
		.max(500, "URL is too long")
		.refine((val) => {
			try {
				const { protocol } = new URL(val.trim());
				return protocol === "http:" || protocol === "https:";
			} catch {
				return false;
			}
		}, "Enter a full URL, like https://yourcompany.com"),
	funding: z.string(),
	accelerator: z.string(),
	notes: z.string().max(800, "Keep notes under 800 characters").optional(),
});

type StartupsFormValues = z.infer<typeof startupsSchema>;

const FIELD_RADIUS = "rounded";

function FormField({
	id,
	label,
	required = false,
	children,
	error,
}: {
	id: string;
	label: string;
	required?: boolean;
	children: React.ReactNode;
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
		</div>
	);
}

export default function StartupsForm() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);

	const {
		register,
		handleSubmit,
		control,
		formState: { errors },
	} = useForm<StartupsFormValues>({
		resolver: zodResolver(startupsSchema),
		defaultValues: {
			name: "",
			email: "",
			companyName: "",
			website: "",
			funding: FUNDING[0],
			accelerator: ACCELERATORS[0],
			notes: "",
		},
	});

	const submitForm = async (data: StartupsFormValues) => {
		setIsSubmitting(true);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30_000);

			const response = await fetch("/api/startups/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			let responseData: Record<string, unknown>;
			try {
				responseData = (await response.json()) as Record<string, unknown>;
			} catch {
				throw new Error("Invalid response from server.");
			}

			if (!response.ok) {
				if (response.status === 429) {
					throw new Error("Too many submissions. Try again later.");
				}
				if (response.status === 400 && responseData.details) {
					const errorMessage = Array.isArray(responseData.details)
						? (responseData.details as string[]).join(", ")
						: String(responseData.error || "Validation failed");
					throw new Error(errorMessage);
				}
				throw new Error(String(responseData.error || "Submission failed."));
			}

			track("startups_submitted");
			setIsSubmitted(true);
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					toast.error("Request timed out. Try again.");
				} else {
					toast.error(error.message);
				}
			} else {
				toast.error("Failed to submit. Try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isSubmitted) {
		return (
			<SciFiCard
				className={`border border-border bg-card/40 p-5 backdrop-blur-sm ${FIELD_RADIUS}`}
			>
				<div className="flex items-start gap-3">
					<CheckIcon className="mt-0.5 size-5 shrink-0 text-foreground" />
					<div>
						<p className="font-medium text-foreground text-sm">
							Application received
						</p>
						<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
							We'll review your application and email you within a few days.
						</p>
					</div>
				</div>
			</SciFiCard>
		);
	}

	return (
		<SciFiCard
			className={`border border-border bg-card/50 p-5 backdrop-blur-sm sm:p-6 ${FIELD_RADIUS}`}
		>
			<form
				autoComplete="off"
				className="space-y-4"
				onSubmit={handleSubmit(submitForm)}
			>
				<FormField error={errors.name?.message} id="name" label="Name" required>
					<Input
						aria-invalid={!!errors.name}
						autoComplete="off"
						className={errors.name ? "border-destructive" : ""}
						id="name"
						maxLength={100}
						placeholder="Your name"
						type="text"
						{...register("name")}
					/>
				</FormField>

				<FormField
					error={errors.email?.message}
					id="email"
					label="Work email"
					required
				>
					<Input
						aria-invalid={!!errors.email}
						autoComplete="off"
						className={errors.email ? "border-destructive" : ""}
						id="email"
						maxLength={255}
						placeholder="you@company.com"
						type="email"
						{...register("email")}
					/>
				</FormField>

				<FormField
					error={errors.companyName?.message}
					id="companyName"
					label="Company"
					required
				>
					<Input
						aria-invalid={!!errors.companyName}
						autoComplete="off"
						className={errors.companyName ? "border-destructive" : ""}
						id="companyName"
						maxLength={120}
						placeholder="Your company"
						type="text"
						{...register("companyName")}
					/>
				</FormField>

				<FormField
					error={errors.website?.message}
					id="website"
					label="Website"
					required
				>
					<Input
						aria-invalid={!!errors.website}
						autoComplete="off"
						className={errors.website ? "border-destructive" : ""}
						id="website"
						maxLength={500}
						placeholder="https://yourcompany.com"
						type="url"
						{...register("website")}
					/>
				</FormField>

				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						error={errors.funding?.message}
						id="funding"
						label="Raised so far"
					>
						<Controller
							control={control}
							name="funding"
							render={({ field }) => (
								<Select onValueChange={field.onChange} value={field.value}>
									<SelectTrigger
										aria-invalid={!!errors.funding}
										className={`h-9 w-full ${FIELD_RADIUS}`}
										id="funding"
									>
										<SelectValue placeholder="Select one" />
									</SelectTrigger>
									<SelectContent>
										{FUNDING.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						/>
					</FormField>

					<FormField
						error={errors.accelerator?.message}
						id="accelerator"
						label="Accelerator"
					>
						<Controller
							control={control}
							name="accelerator"
							render={({ field }) => (
								<Select onValueChange={field.onChange} value={field.value}>
									<SelectTrigger
										aria-invalid={!!errors.accelerator}
										className={`h-9 w-full ${FIELD_RADIUS}`}
										id="accelerator"
									>
										<SelectValue placeholder="Select one" />
									</SelectTrigger>
									<SelectContent>
										{ACCELERATORS.map((option) => (
											<SelectItem key={option} value={option}>
												{option}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						/>
					</FormField>
				</div>

				<FormField
					error={errors.notes?.message}
					id="notes"
					label="Anything else?"
				>
					<Textarea
						aria-invalid={!!errors.notes}
						className={`${FIELD_RADIUS} ${
							errors.notes ? "border-destructive" : ""
						}`}
						id="notes"
						maxLength={800}
						placeholder="Optional - what you're building, which plan you're looking at"
						rows={3}
						{...register("notes")}
					/>
				</FormField>

				<div className="pt-2">
					<SciFiButton
						aria-label={isSubmitting ? "Sending application" : "Apply"}
						className="w-full"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? (
							<>
								<SpinnerIcon className="size-4 animate-spin" />
								Sending
							</>
						) : (
							<>
								<PaperPlaneIcon className="size-4" />
								Apply
							</>
						)}
					</SciFiButton>
				</div>
			</form>
		</SciFiCard>
	);
}
