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
							{badge && <Badge variant="amber">{badge}</Badge>}
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
				{optional && <span className="text-muted-foreground"> (optional)</span>}
			</Label>
			{children}
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
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

			<FormField id="issuer" label="Issuer URL">
				<Input
					id="issuer"
					onChange={(e) => onChange({ issuer: e.target.value })}
					placeholder="https://idp.example.com..."
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
			<FormField id="entry-point" label="SSO URL">
				<Input
					id="entry-point"
					onChange={(e) => onChange({ entryPoint: e.target.value })}
					placeholder="https://idp.example.com/sso..."
					value={form.entryPoint}
				/>
			</FormField>

			<FormField id="certificate" label="IdP Certificate">
				<Textarea
					className="font-mono text-xs"
					id="certificate"
					onChange={(e) => onChange({ certificate: e.target.value })}
					placeholder="-----BEGIN CERTIFICATE-----"
					rows={3}
					value={form.certificate}
				/>
			</FormField>

			<FormField id="idp-metadata" label="IdP Metadata" optional>
				<Textarea
					className="font-mono text-xs"
					id="idp-metadata"
					onChange={(e) => onChange({ idpMetadata: e.target.value })}
					placeholder="Paste IdP metadata XML..."
					rows={3}
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

function ServiceProviderInfo() {
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
				<div className="flex items-center justify-between gap-2">
					<span className="text-foreground">Callback URL</span>
					<code className="truncate px-2 py-1 text-xs">
						/api/auth/sso/callback/[id]
					</code>
				</div>
				<div className="flex items-center justify-between gap-2">
					<span className="text-foreground">Entity ID</span>
					<code className="truncate px-2 py-1 text-xs">
						https://app.databuddy.cc
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
			const providerId = generateProviderId(form.providerName);

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
							issuer: form.issuer,
							domain: form.domain,
							organizationId,
							samlConfig: {
								entryPoint: form.entryPoint,
								cert: form.certificate,
								callbackUrl: `${window.location.origin}/api/auth/sso/saml2/callback/${providerId}`,
								audience: window.location.origin,
								wantAssertionsSigned: true,
								signatureAlgorithm: "sha256",
								digestAlgorithm: "sha256",
								identifierFormat:
									"urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
								spMetadata: {},
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
					<ServiceProviderInfo />
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
