"use client";

import {
	AndroidLogoIcon,
	AppleLogoIcon,
	CalendarIcon,
	DeviceMobileIcon,
	ImageIcon,
	LinkSimpleIcon,
} from "@phosphor-icons/react";
import type { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "./collapsible-section";
import { ExpirationPicker } from "./expiration-picker";
import { LINKS_BASE_URL } from "./link-constants";
import type { ExpandedSection, LinkFormData } from "./link-form-schema";
import { normalizeUrlInput, stripProtocol } from "./link-utils";
import { type OgData, OgPreview } from "./og-preview";
import { UtmBuilder, type UtmParams } from "./utm-builder";

interface LinkFormFieldsProps {
	form: UseFormReturn<LinkFormData>;
	isEditMode: boolean;
	expandedSection: ExpandedSection;
	onToggleSectionAction: (section: ExpandedSection) => void;
	slugValue: string | undefined;
	fullTargetUrl: string;
	utmParams: UtmParams;
	onUtmParamsChangeAction: (params: UtmParams) => void;
	ogData: OgData;
	onOgDataChangeAction: (data: OgData) => void;
	useCustomOg: boolean;
	onUseCustomOgChangeAction: (useCustom: boolean) => void;
	hasExpiration: boolean;
	deviceTargetingCount: number;
	utmParamsCount: number;
	hasCustomSocial: boolean;
}

export function LinkFormFields({
	form,
	isEditMode,
	expandedSection,
	onToggleSectionAction,
	slugValue,
	fullTargetUrl,
	utmParams,
	onUtmParamsChangeAction,
	ogData,
	onOgDataChangeAction,
	useCustomOg,
	onUseCustomOgChangeAction,
	hasExpiration,
	deviceTargetingCount,
	utmParamsCount,
	hasCustomSocial,
}: LinkFormFieldsProps) {
	return (
		<div className="space-y-4">
			<FormField
				control={form.control}
				name="targetUrl"
				render={({ field }) => (
					<FormItem>
						<FormLabel>
							Destination URL
							<span className="ml-1 text-destructive">*</span>
						</FormLabel>
						<FormControl>
							<Input
								placeholder="example.com/landing-page…"
								prefix="https://"
								{...field}
								onChange={(e) => {
									field.onChange(normalizeUrlInput(e.target.value));
								}}
							/>
						</FormControl>
						<FormDescription className="text-pretty">
							Where users will be redirected when clicking your link
						</FormDescription>
						<FormMessage />
					</FormItem>
				)}
			/>

			<div className="h-px bg-border" />

			<div className="space-y-4">
				<div className="grid place-items-start gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="Marketing Campaign…" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="slug"
						render={({ field }) => (
							<FormItem>
								<FormLabel>
									Short Link
									{!isEditMode && (
										<span className="ml-1 text-muted-foreground">
											(optional)
										</span>
									)}
								</FormLabel>
								<FormControl>
									<Input
										className={cn(isEditMode && "bg-muted")}
										disabled={isEditMode}
										placeholder={isEditMode ? "" : "my-campaign"}
										prefix={`${LINKS_BASE_URL}/`}
										{...field}
										onChange={(e) => {
											field.onChange(e.target.value.replace(/\s/g, "-"));
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="externalId"
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								External ID
								<span className="ml-1 text-muted-foreground">(optional)</span>
							</FormLabel>
							<FormControl>
								<Input
									placeholder="company-123"
									{...field}
									value={field.value ?? ""}
								/>
							</FormControl>
							<FormDescription className="text-pretty">
								Third-party identifier for querying (e.g. company, campaign, or
								partner ID). Use to filter invite links or attribute traffic.
							</FormDescription>
							<FormMessage />
						</FormItem>
					)}
				/>

				{!(isEditMode || slugValue) && (
					<p className="text-muted-foreground text-xs">
						Leave empty to auto-generate a random short slug
					</p>
				)}
			</div>

			<div className="h-px bg-border" />

			<div className="space-y-1">
				<CollapsibleSection
					badge={hasExpiration}
					icon={CalendarIcon}
					isExpanded={expandedSection === "expiration"}
					onToggleAction={() => onToggleSectionAction("expiration")}
					title="Link Expiration"
				>
					<div className="space-y-4">
						<FormField
							control={form.control}
							name="expiresAt"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<ExpirationPicker
											onChange={field.onChange}
											value={field.value}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="expiredRedirectUrl"
							render={({ field }) => (
								<FormItem>
									<Label className="text-xs" htmlFor="expired-redirect">
										Redirect URL after expiration
									</Label>
									<FormControl>
										<Input
											className="h-9"
											id="expired-redirect"
											placeholder="example.com/link-expired…"
											prefix="https://"
											{...field}
											onChange={(e) => {
												field.onChange(stripProtocol(e.target.value.trim()));
											}}
										/>
									</FormControl>
									<FormDescription className="text-pretty text-xs">
										Optional fallback page for expired links
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
					</div>
				</CollapsibleSection>

				<CollapsibleSection
					badge={deviceTargetingCount}
					icon={DeviceMobileIcon}
					isExpanded={expandedSection === "devices"}
					onToggleAction={() => onToggleSectionAction("devices")}
					title="Device Targeting"
				>
					<div className="space-y-4">
						<p className="text-pretty text-muted-foreground text-xs">
							Redirect mobile users to device-specific URLs like app stores
						</p>

						<div className="grid gap-4 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="iosUrl"
								render={({ field }) => (
									<FormItem>
										<Label
											className="flex items-center gap-1.5 text-xs"
											htmlFor="ios-url"
										>
											<AppleLogoIcon size={14} weight="fill" />
											iOS URL
										</Label>
										<FormControl>
											<Input
												className="h-9"
												id="ios-url"
												placeholder="apps.apple.com/app/…"
												prefix="https://"
												{...field}
												onChange={(e) => {
													field.onChange(stripProtocol(e.target.value.trim()));
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="androidUrl"
								render={({ field }) => (
									<FormItem>
										<Label
											className="flex items-center gap-1.5 text-xs"
											htmlFor="android-url"
										>
											<AndroidLogoIcon size={14} weight="fill" />
											Android URL
										</Label>
										<FormControl>
											<Input
												className="h-9"
												id="android-url"
												placeholder="play.google.com/store/apps/…"
												prefix="https://"
												{...field}
												onChange={(e) => {
													field.onChange(stripProtocol(e.target.value.trim()));
												}}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
					</div>
				</CollapsibleSection>

				<CollapsibleSection
					badge={utmParamsCount}
					icon={LinkSimpleIcon}
					isExpanded={expandedSection === "utm"}
					onToggleAction={() => onToggleSectionAction("utm")}
					title="UTM Parameters"
				>
					<UtmBuilder
						baseUrl={fullTargetUrl}
						onChange={onUtmParamsChangeAction}
						value={utmParams}
					/>
				</CollapsibleSection>

				<CollapsibleSection
					badge={hasCustomSocial}
					icon={ImageIcon}
					isExpanded={expandedSection === "social"}
					onToggleAction={() => onToggleSectionAction("social")}
					title="Social Preview"
				>
					<OgPreview
						onChange={onOgDataChangeAction}
						onUseCustomOgChange={onUseCustomOgChangeAction}
						targetUrl={fullTargetUrl}
						useCustomOg={useCustomOg}
						value={ogData}
					/>
				</CollapsibleSection>
			</div>
		</div>
	);
}
