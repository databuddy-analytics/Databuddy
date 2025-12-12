"use client";

import {
	CheckCircleIcon,
	CircleNotchIcon,
	FingerprintIcon,
	GlobeIcon,
	LockKeyIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetBody,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { generateProviderId, useSSO } from "./use-sso";

type ProviderType = "oidc" | "saml";

type SSOProviderSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
};

type FormState = {
	providerName: string;
	domain: string;
	issuer: string;
	clientId: string;
	clientSecret: string;
	discoveryEndpoint: string;
	entryPoint: string;
	certificate: string;
	idpMetadata: string;
};

const INITIAL_FORM: FormState = {
	providerName: "",
	domain: "",
	issuer: "",
	clientId: "",
	clientSecret: "",
	discoveryEndpoint: "",
	entryPoint: "",
	certificate: "",
	idpMetadata: "",
};

function ProtocolSelector({
	value,
	onChange,
}: {
	value: ProviderType;
	onChange: (type: ProviderType) => void;
}) {
	const protocols = [
		{ type: "oidc" as const, label: "OIDC / OAuth2", icon: LockKeyIcon },
		{
			type: "saml" as const,
			label: "SAML 2.0",
			icon: FingerprintIcon,
			badge: "Beta",
		},
	];

	return (
		<section className="space-y-3">
			<Label className="font-medium">Protocol</Label>
			<div className="grid grid-cols-2 gap-2">
				{protocols.map(({ type, label, icon: Icon, badge }) => (
					<button
						className={`flex flex-col items-center gap-1.5 rounded border p-3 ${
							value === type
								? "border-primary bg-primary/5"
								: "hover:border-muted-foreground/50"
						}`}
						key={type}
						onClick={() => onChange(type)}
						type="button"
					>
						<Icon
							className={
								value === type ? "text-primary" : "text-muted-foreground"
							}
							size={20}
							weight="duotone"
						/>
						<div className="flex items-center gap-1.5">
							<span className="font-medium text-sm">{label}</span>
							{badge ? <Badge variant="amber">{badge}</Badge> : null}
						</div>
					</button>
				))}
			</div>
		</section>
	);
}

function FormField({
	id,
	label,
	optional,
	hint,
	children,
}: {
	id: string;
	label: string;
	optional?: boolean;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<Label className="font-medium" htmlFor={id}>
				{label}
				{optional ? (
					<span className="text-muted-foreground"> (optional)</span>
				) : null}
			</Label>
			{children}
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
		</div>
	);
}

function BaseConfigFields({
	form,
	onChange,
}: {
	form: FormState;
	onChange: (updates: Partial<FormState>) => void;
}) {
	return (
		<section className="space-y-3">
			<FormField id="provider-name" label="Provider Name">
				<Input
					id="provider-name"
					onChange={(e) => onChange({ providerName: e.target.value })}
					placeholder="e.g., Okta, Azure AD..."
					value={form.providerName}
				/>
			</FormField>

			<FormField
				hint="Users with this email domain will use this provider"
				id="domain"
				label="Domain"
			>
				<Input
					id="domain"
					onChange={(e) => onChange({ domain: e.target.value })}
					placeholder="example.com..."
					value={form.domain}
				/>
			</FormField>

			<FormField
				hint="The IdP entity ID or SP metadata URL (auto-generated for SAML)"
				id="issuer"
				label="Issuer URL"
			>
				<Input
					id="issuer"
					onChange={(e) => onChange({ issuer: e.target.value })}
					placeholder="https://idp.example.com or leave empty for SAML"
					value={form.issuer}
				/>
			</FormField>
		</section>
	);
}

function OIDCConfigFields({
	form,
	onChange,
}: {
	form: FormState;
	onChange: (updates: Partial<FormState>) => void;
}) {
	return (
		<div className="space-y-3">
			<FormField id="client-id" label="Client ID">
				<Input
					id="client-id"
					onChange={(e) => onChange({ clientId: e.target.value })}
					placeholder="your-client-id..."
					value={form.clientId}
				/>
			</FormField>

			<FormField id="client-secret" label="Client Secret">
				<Input
					id="client-secret"
					onChange={(e) => onChange({ clientSecret: e.target.value })}
					placeholder="your-client-secret..."
					type="password"
					value={form.clientSecret}
				/>
			</FormField>

			<FormField id="discovery-url" label="Discovery URL" optional>
				<Input
					id="discovery-url"
					onChange={(e) => onChange({ discoveryEndpoint: e.target.value })}
					placeholder="https://.../.well-known/openid-configuration"
					value={form.discoveryEndpoint}
				/>
			</FormField>
		</div>
	);
}

function SAMLConfigFields({
	form,
	onChange,
}: {
	form: FormState;
	onChange: (updates: Partial<FormState>) => void;
}) {
	return (
		<div className="space-y-3">
			<FormField
				hint="The IdP Single Sign-on URL (from Okta: Single Sign-on URL)"
				id="entry-point"
				label="SSO URL (Entry Point)"
			>
				<Input
					id="entry-point"
					onChange={(e) => onChange({ entryPoint: e.target.value })}
					placeholder="https://trial-1076874.okta.com/app/.../sso/saml"
					value={form.entryPoint}
				/>
			</FormField>
		
			<FormField
				hint="Paste the IdP certificate from Okta (X.509 Certificate)"
				id="certificate"
				label="IdP Certificate"
			>
				<Textarea
					className="font-mono text-xs"
					id="certificate"
					onChange={(e) => onChange({ certificate: e.target.value })}
					placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDqjCCApKgAwIBAgIGAZhVGMeUMA0GCSqGSIb3DQEBCwUAMIGVMQswCQYDVQQGEwJVUzETMBEG&#10;...&#10;-----END CERTIFICATE-----"
					rows={5}
					value={form.certificate}
				/>
			</FormField>

			<FormField
				hint="Optional: Paste the full IdP metadata XML from Okta (alternative to manual configuration)"
				id="idp-metadata"
				label="IdP Metadata XML"
				optional
			>
				<Textarea
					className="font-mono text-xs"
					id="idp-metadata"
					onChange={(e) => onChange({ idpMetadata: e.target.value })}
					placeholder="&lt;md:EntityDescriptor xmlns:md=&quot;urn:oasis:names:tc:SAML:2.0:metadata&quot;&gt;&#10;  ...&#10;&lt;/md:EntityDescriptor&gt;"
					rows={5}
					value={form.idpMetadata}
				/>
			</FormField>
		</div>
	);
}

function ProtocolConfigSection({
	type,
	form,
	onChange,
}: {
	type: ProviderType;
	form: FormState;
	onChange: (updates: Partial<FormState>) => void;
}) {
	const Icon = type === "oidc" ? LockKeyIcon : FingerprintIcon;
	const title = type === "oidc" ? "OIDC Configuration" : "SAML Configuration";

	return (
		<section className="rounded border bg-card p-4">
			<div className="mb-3 flex items-center gap-2">
				<Icon className="text-muted-foreground" size={16} weight="duotone" />
				<span className="font-medium text-sm">{title}</span>
			</div>
			{type === "oidc" ? (
				<OIDCConfigFields form={form} onChange={onChange} />
			) : (
				<SAMLConfigFields form={form} onChange={onChange} />
			)}
		</section>
	);
}

function ServiceProviderInfo({ providerId }: { providerId?: string }) {
	const baseUrl =
		typeof window !== "undefined"
			? window.location.origin
			: "https://app.databuddy.cc";
	const acsUrl = providerId
		? `${baseUrl}/api/auth/sso/saml2/sp/acs/${providerId}`
		: `${baseUrl}/api/auth/sso/saml2/sp/acs/[providerId]`;
	const metadataUrl = providerId
		? `${baseUrl}/api/auth/sso/saml2/sp/metadata/${providerId}`
		: `${baseUrl}/api/auth/sso/saml2/sp/metadata/[providerId]`;

	return (
		<section className="rounded border bg-card p-4">
			<div className="mb-3 flex items-center gap-2">
				<GlobeIcon
					className="text-muted-foreground"
					size={16}
					weight="duotone"
				/>
				<span className="font-medium text-sm">Service Provider Details</span>
			</div>
			<div className="space-y-2.5 text-sm">
				<div className="flex flex-col gap-1">
					<span className="text-foreground">Single Sign-on URL (ACS)</span>
					<code className="break-all rounded bg-muted px-2 py-1 text-xs">
						{acsUrl}
					</code>
				</div>
				<div className="flex flex-col gap-1">
					<span className="text-foreground">Audience URI (SP Entity ID)</span>
					<code className="break-all rounded bg-muted px-2 py-1 text-xs">
						{metadataUrl}
					</code>
				</div>
			</div>
		</section>
	);
}

export function SSOProviderSheet({
	open,
	onOpenChange,
	organizationId,
}: SSOProviderSheetProps) {
	const [providerType, setProviderType] = useState<ProviderType>("oidc");
	const [form, setForm] = useState<FormState>(INITIAL_FORM);

	const { registerProviderAsync, isRegistering } = useSSO(organizationId);

	const updateForm = (updates: Partial<FormState>) => {
		setForm((prev) => ({ ...prev, ...updates }));
	};

	const resetState = () => {
		setProviderType("oidc");
		setForm(INITIAL_FORM);
	};

	const handleClose = () => {
		onOpenChange(false);
		setTimeout(resetState, 200);
	};

	const handleCreate = async () => {
		try {
			// Validate required fields
			if (!form.providerName.trim()) {
				toast.error("Provider name is required");
				return;
			}

			if (!form.domain.trim()) {
				toast.error("Domain is required");
				return;
			}

			if (providerType === "oidc") {
				const hasClientId = form.clientId.trim();
				const hasClientSecret = form.clientSecret.trim();
				if (!(hasClientId && hasClientSecret)) {
					toast.error("Client ID and Client Secret are required for OIDC");
					return;
				}
			}

			if (providerType === "saml") {
				if (!form.entryPoint.trim()) {
					toast.error("SSO URL (Entry Point) is required for SAML");
					return;
				}
				if (!form.certificate.trim()) {
					toast.error("IdP Certificate is required for SAML");
					return;
				}
			}

			const providerId = generateProviderId(form.providerName);
			const baseUrl =
				typeof window !== "undefined"
					? window.location.origin
					: "https://app.databuddy.cc";

			const payload =
				providerType === "oidc"
					? {
							providerId,
							issuer: form.issuer,
							domain: form.domain,
							organizationId,
							oidcConfig: {
								clientId: form.clientId,
								clientSecret: form.clientSecret,
								discoveryEndpoint: form.discoveryEndpoint || undefined,
								scopes: ["openid", "email", "profile"],
								pkce: true,
								mapping: {
									id: "sub",
									email: "email",
									emailVerified: "email_verified",
									name: "name",
									image: "picture",
								},
							},
						}
					: {
							providerId,
							issuer:
								form.issuer ||
								`${baseUrl}/api/auth/sso/saml2/sp/metadata/${providerId}`,
							domain: form.domain,
							organizationId,
							samlConfig: {
								entryPoint: form.entryPoint,
								cert: form.certificate,
								callbackUrl: `${baseUrl}/api/auth/sso/saml2/sp/acs/${providerId}`,
								audience: `${baseUrl}/api/auth/sso/saml2/sp/metadata/${providerId}`,
								wantAssertionsSigned: true,
								signatureAlgorithm: "sha256",
								digestAlgorithm: "sha256",
								identifierFormat:
									"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
								spMetadata: {
									entityID: `${baseUrl}/api/auth/sso/saml2/sp/metadata/${providerId}`,
								},
								idpMetadata: form.idpMetadata
									? { metadata: form.idpMetadata }
									: undefined,
								mapping: {
									id: "nameID",
									email: "email",
									name: "displayName",
									emailVerified: "email_verified",
								},
							},
						};

			await registerProviderAsync(payload);
			toast.success("SSO provider created");
			handleClose();
		} catch (err) {
			console.error("SSO creation error:", err);
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to create SSO provider. Please check your configuration."
			);
		}
	};

	return (
		<Sheet onOpenChange={handleClose} open={open}>
			<SheetContent className="sm:max-w-md" side="right">
				<SheetHeader>
					<div className="flex items-center gap-4">
						<div className="flex h-11 w-11 items-center justify-center rounded border bg-secondary-brighter">
							<FingerprintIcon
								className="text-accent-foreground"
								size={22}
								weight="fill"
							/>
						</div>
						<div>
							<SheetTitle className="text-lg">Add SSO Provider</SheetTitle>
							<SheetDescription>
								Configure single sign-on for your organization
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<SheetBody className="space-y-5">
					<ProtocolSelector onChange={setProviderType} value={providerType} />
					<BaseConfigFields form={form} onChange={updateForm} />
					<ProtocolConfigSection
						form={form}
						onChange={updateForm}
						type={providerType}
					/>
					{providerType === "saml" && (
						<ServiceProviderInfo
							providerId={generateProviderId(form.providerName) || undefined}
						/>
					)}
				</SheetBody>

				<SheetFooter>
					<Button
						disabled={isRegistering}
						onClick={handleClose}
						variant="ghost"
					>
						Cancel
					</Button>
					<Button disabled={isRegistering} onClick={handleCreate}>
						{isRegistering ? (
							<CircleNotchIcon className="animate-spin" size={16} />
						) : (
							<CheckCircleIcon size={16} />
						)}
						Create Provider
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
