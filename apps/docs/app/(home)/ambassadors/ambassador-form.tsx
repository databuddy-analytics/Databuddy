'use client';

import { CheckIcon, PaperPlaneIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { SciFiButton } from '@/components/landing/scifi-btn';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface FormData {
	name: string;
	email: string;
	xHandle: string;
	website: string;
	whyAmbassador: string;
	experience: string;
	audience: string;
	referralSource: string;
}

const initialFormData: FormData = {
	name: '',
	email: '',
	xHandle: '',
	website: '',
	whyAmbassador: '',
	experience: '',
	audience: '',
	referralSource: '',
};

function FormField({
	label,
	required = false,
	children,
	description,
}: {
	label: string;
	required?: boolean;
	children: React.ReactNode;
	description?: string;
}) {
	return (
		<div className="space-y-2">
			<Label className="text-foreground">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</Label>
			{children}
			{description && (
				<p className="text-muted-foreground text-xs">{description}</p>
			)}
		</div>
	);
}

export default function AmbassadorForm() {
	const [formData, setFormData] = useState<FormData>(initialFormData);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);

	const handleInputChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			const response = await fetch('/api/ambassador/submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(formData),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Submission failed');
			}

			setIsSubmitted(true);
		} catch (error) {
			console.error('Form submission error:', error);
			alert('Failed to submit application. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	if (isSubmitted) {
		return (
			<div className="mx-auto max-w-md text-center">
				<div className="group relative">
					<div className="relative rounded border border-green-500/50 bg-green-500/5 p-8 backdrop-blur-sm">
						<CheckIcon
							className="mx-auto mb-4 h-12 w-12 text-green-500"
							weight="duotone"
						/>
						<h3 className="mb-2 font-semibold text-foreground text-xl">
							Application Submitted!
						</h3>
						<p className="text-muted-foreground text-sm">
							Thank you for your interest in becoming a Databuddy ambassador.
							We'll review your application and get back to you within 3-5
							business days.
						</p>
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-green-500" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-green-500" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-green-500" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-green-500" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-green-500" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-green-500" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-green-500" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-green-500" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div>
			{/* Header */}
			<div className="mb-8 text-center">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Ambassador Application
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Tell us about yourself and why you'd be a great Databuddy ambassador
				</p>
			</div>

			{/* Form */}
			<div className="group relative">
				<div className="relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm sm:p-8">
					<form className="space-y-6" onSubmit={handleSubmit}>
						{/* Personal Information */}
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<FormField label="Full Name" required>
								<Input
									maxLength={100}
									name="name"
									onChange={handleInputChange}
									placeholder="John Doe"
									required
									type="text"
									value={formData.name}
								/>
							</FormField>

							<FormField label="Email Address" required>
								<Input
									maxLength={255}
									name="email"
									onChange={handleInputChange}
									placeholder="john@example.com"
									required
									type="email"
									value={formData.email}
								/>
							</FormField>
						</div>

						{/* Social & Web Presence */}
						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<FormField
								description="Enter your X (Twitter) handle without the @"
								label="X (Twitter) Handle"
							>
								<Input
									maxLength={50}
									name="xHandle"
									onChange={handleInputChange}
									placeholder="johndoe"
									type="text"
									value={formData.xHandle}
								/>
							</FormField>

							<FormField
								description="Your personal website, blog, or portfolio"
								label="Website"
							>
								<Input
									maxLength={500}
									name="website"
									onChange={handleInputChange}
									placeholder="https://johndoe.com"
									type="url"
									value={formData.website}
								/>
							</FormField>
						</div>

						{/* Experience & Background */}
						<FormField
							description="Tell us about your experience with analytics, privacy, or developer tools (max 800 characters)"
							label="Relevant Experience"
						>
							<Textarea
								maxLength={800}
								name="experience"
								onChange={handleInputChange}
								placeholder="I've been working in web development for 5 years and am passionate about privacy-first solutions..."
								rows={4}
								value={formData.experience}
							/>
							<div className="text-right text-muted-foreground text-xs">
								{formData.experience.length}/800 characters
							</div>
						</FormField>

						{/* Motivation */}
						<FormField
							description="Required field (max 1000 characters)"
							label="Why do you want to be a Databuddy ambassador?"
							required
						>
							<Textarea
								maxLength={1000}
								name="whyAmbassador"
								onChange={handleInputChange}
								placeholder="I believe in privacy-first analytics and want to help spread awareness about better data practices..."
								required
								rows={4}
								value={formData.whyAmbassador}
							/>
							<div className="text-right text-muted-foreground text-xs">
								{formData.whyAmbassador.length}/1000 characters
							</div>
						</FormField>

						{/* Audience & Reach */}
						<FormField
							description="Describe your audience size and engagement across platforms (max 600 characters)"
							label="Audience & Reach"
						>
							<Textarea
								maxLength={600}
								name="audience"
								onChange={handleInputChange}
								placeholder="I have 5K followers on X, run a tech blog with 10K monthly visitors, and speak at 3-4 conferences per year..."
								rows={3}
								value={formData.audience}
							/>
							<div className="text-right text-muted-foreground text-xs">
								{formData.audience.length}/600 characters
							</div>
						</FormField>

						{/* How did you hear about us */}
						<FormField label="How did you hear about Databuddy?">
							<Input
								maxLength={200}
								name="referralSource"
								onChange={handleInputChange}
								placeholder="Twitter, GitHub, friend recommendation, etc."
								type="text"
								value={formData.referralSource}
							/>
						</FormField>

						{/* Submit Button */}
						<div className="pt-4">
							<SciFiButton
								className="w-full sm:w-auto"
								disabled={isSubmitting}
								type="submit"
							>
								{isSubmitting ? (
									<>
										<SpinnerIcon className="h-4 w-4 animate-spin" />
										Submitting Application...
									</>
								) : (
									<>
										<PaperPlaneIcon className="h-4 w-4" weight="duotone" />
										Submit Application
									</>
								)}
							</SciFiButton>
						</div>
					</form>
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>
		</div>
	);
}
