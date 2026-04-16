"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, PaperPlaneIcon, SpinnerIcon } from "@phosphor-icons/react";
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

const ACCELERATORS = [
	{ value: "none", label: "Not in one" },
	{ value: "yc", label: "Y Combinator" },
	{ value: "techstars", label: "Techstars" },
	{ value: "antler", label: "Antler" },
	{ value: "500-global", label: "500 Global" },
	{ value: "entrepreneur-first", label: "Entrepreneur First" },
	{ value: "a16z-speedrun", label: "a16z Speedrun" },
	{ value: "other", label: "Other" },
] as const;

const ossSchema = z.object({
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
	projectName: z
		.string()
		.min(1, "Project name is required")
		.max(120, "Project name is too long"),
	repoUrl: z
		.string()
		.min(1, "Repository URL is required")
		.max(500, "URL is too long")
		.refine((val) => {
			try {
				const url = new URL(val.trim());
				if (
					url.hostname !== "github.com" &&
					url.hostname !== "www.github.com"
				) {
					return false;
				}
				return url.pathname.split("/").filter(Boolean).length >= 2;
			} catch {
				return false;
			}
		}, "Must be a github.com repository URL"),
	accelerator: z.string(),
	notes: z.string().max(800, "Keep notes under 800 characters").optional(),
});

type OssFormValues = z.infer<typeof ossSchema>;

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

export default function OssForm() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);

	const {
		register,
		handleSubmit,
		control,
		formState: { errors },
	} = useForm<OssFormValues>({
		resolver: zodResolver(ossSchema),
		defaultValues: {
			name: "",
			email: "",
			projectName: "",
			repoUrl: "",
			accelerator: "none",
			notes: "",
		},
	});

	const submitForm = async (data: OssFormValues) => {
		setIsSubmitting(true);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30_000);

			const response = await fetch("/api/oss/submit", {
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
					<CheckIcon
						className="mt-0.5 size-5 shrink-0 text-foreground"
						weight="duotone"
					/>
					<div>
						<p className="font-medium text-foreground text-sm">
							Application received
						</p>
						<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
							We'll review your project and get back to you within a few days.
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
						placeholder="Jane Doe"
						type="text"
						{...register("name")}
					/>
				</FormField>

				<FormField
					error={errors.email?.message}
					id="email"
					label="Email"
					required
				>
					<Input
						aria-invalid={!!errors.email}
						autoComplete="off"
						className={errors.email ? "border-destructive" : ""}
						id="email"
						maxLength={255}
						placeholder="jane@example.com"
						type="email"
						{...register("email")}
					/>
				</FormField>

				<FormField
					error={errors.projectName?.message}
					id="projectName"
					label="Project name"
					required
				>
					<Input
						aria-invalid={!!errors.projectName}
						autoComplete="off"
						className={errors.projectName ? "border-destructive" : ""}
						id="projectName"
						maxLength={120}
						placeholder="my-awesome-lib"
						type="text"
						{...register("projectName")}
					/>
				</FormField>

				<FormField
					error={errors.repoUrl?.message}
					id="repoUrl"
					label="GitHub repository"
					required
				>
					<Input
						aria-invalid={!!errors.repoUrl}
						autoComplete="off"
						className={errors.repoUrl ? "border-destructive" : ""}
						id="repoUrl"
						maxLength={500}
						placeholder="https://github.com/your-org/your-repo"
						type="url"
						{...register("repoUrl")}
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
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					/>
				</FormField>

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
						placeholder="Optional — project size, traffic, what you'd use it for"
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
								<PaperPlaneIcon className="size-4" weight="duotone" />
								Apply
							</>
						)}
					</SciFiButton>
				</div>
			</form>
		</SciFiCard>
	);
}
