"use client";

import { authClient } from "@databuddy/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc";

export type SSOProviderType = "oidc" | "saml";

export type SSOProvider = {
	id: string;
	providerId: string;
	issuer: string;
	domain: string;
	organizationId: string | null;
	userId: string | null;
	oidcConfig: unknown;
	samlConfig: unknown;
};

export type OIDCConfig = {
	clientId: string;
	clientSecret: string;
	authorizationEndpoint?: string;
	tokenEndpoint?: string;
	jwksEndpoint?: string;
	discoveryEndpoint?: string;
	scopes?: string[];
	pkce?: boolean;
	mapping?: {
		id?: string;
		email?: string;
		emailVerified?: string;
		name?: string;
		image?: string;
		extraFields?: Record<string, string>;
	};
};

export type SAMLConfig = {
	entryPoint: string;
	cert: string;
	callbackUrl: string;
	audience?: string;
	wantAssertionsSigned?: boolean;
	signatureAlgorithm?: string;
	digestAlgorithm?: string;
	identifierFormat?: string;
	idpMetadata?: {
		metadata?: string;
		privateKey?: string;
		privateKeyPass?: string;
		isAssertionEncrypted?: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
	};
	spMetadata?: {
		metadata?: string;
		entityID?: string;
		binding?: string;
		privateKey?: string;
		privateKeyPass?: string;
		isAssertionEncrypted?: boolean;
		encPrivateKey?: string;
		encPrivateKeyPass?: string;
	};
	mapping?: {
		id?: string;
		email?: string;
		name?: string;
		firstName?: string;
		lastName?: string;
		emailVerified?: string;
		extraFields?: Record<string, string>;
	};
};

type RegisterOIDCProviderData = {
	providerId: string;
	issuer: string;
	domain: string;
	organizationId?: string;
	oidcConfig: OIDCConfig;
};

type RegisterSAMLProviderData = {
	providerId: string;
	issuer: string;
	domain: string;
	organizationId?: string;
	samlConfig: SAMLConfig;
};

type RegisterProviderData = RegisterOIDCProviderData | RegisterSAMLProviderData;

const SSO_QUERY_KEYS = {
	providers: (organizationId: string) =>
		["sso", "providers", organizationId] as const,
	provider: (providerId: string) => ["sso", "provider", providerId] as const,
	spMetadata: (providerId: string) =>
		["sso", "spMetadata", providerId] as const,
} as const;

export function useSSO(organizationId: string) {
	const queryClient = useQueryClient();
	const listQueryOptions = orpc.sso.list.queryOptions({
		input: { organizationId },
	});

	const invalidateSSOQueries = () => {
		queryClient.invalidateQueries({
			queryKey: listQueryOptions.queryKey,
		});
	};

	const {
		data: providers = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		...listQueryOptions,
		enabled: !!organizationId,
	});

	const registerProviderMutation = useMutation({
		mutationFn: async (providerData: RegisterProviderData) => {
			const { data, error: apiError } = await authClient.sso.register(
				providerData as Parameters<typeof authClient.sso.register>[0]
			);
			if (apiError) {
				throw new Error(apiError.message || "Failed to register SSO provider");
			}
			return data;
		},
		onSuccess: () => {
			invalidateSSOQueries();
		},
	});

	const deleteProviderMutation = useMutation({
		...orpc.sso.delete.mutationOptions(),
		onSuccess: () => {
			invalidateSSOQueries();
			toast.success("SSO provider deleted successfully");
		},
	});

	return {
		providers,
		isLoading,
		error,
		hasError: !!error,
		refetch,

		registerProvider: registerProviderMutation.mutate,
		registerProviderAsync: registerProviderMutation.mutateAsync,
		deleteProvider: (providerId: string) =>
			deleteProviderMutation.mutate({ providerId }),
		deleteProviderAsync: (providerId: string) =>
			deleteProviderMutation.mutateAsync({ providerId }),

		isRegistering: registerProviderMutation.isPending,
		isDeleting: deleteProviderMutation.isPending,
	};
}

export function useSSOProvider(providerId: string) {
	const queryClient = useQueryClient();

	const {
		data: provider,
		isLoading,
		error,
		refetch,
	} = useQuery({
		...orpc.sso.getById.queryOptions({
			input: { providerId },
		}),
		enabled: !!providerId,
	});

	const invalidateProvider = () => {
		queryClient.invalidateQueries({
			queryKey: SSO_QUERY_KEYS.provider(providerId),
		});
	};

	return {
		provider,
		isLoading,
		error,
		hasError: !!error,
		refetch,
		invalidate: invalidateProvider,
	};
}

export function useSPMetadata(
	providerId: string,
	format: "xml" | "json" = "xml"
) {
	const {
		data: metadata,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: [...SSO_QUERY_KEYS.spMetadata(providerId), format],
		queryFn: async () => {
			const response = await fetch(
				`/api/auth/sso/saml2/metadata/${providerId}?format=${format}`
			);
			if (!response.ok) {
				throw new Error("Failed to fetch SP metadata");
			}
			return format === "xml" ? response.text() : response.json();
		},
		enabled: !!providerId,
	});

	return {
		metadata,
		isLoading,
		error,
		hasError: !!error,
		refetch,
	};
}

export function generateProviderId(name: string): string {
	return name
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
}
