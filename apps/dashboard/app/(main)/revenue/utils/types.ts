export type OnboardingStep = "overview" | "webhook" | "testing" | "complete";

export interface RevenueConfig {
	id?: string;
	userId?: string;
	webhookToken: string;
	webhookSecret?: string;
	isLiveMode: boolean;
	isActive?: boolean;
	lastWebhookAt?: string | null;
	webhookFailureCount?: number;
	createdAt?: string;
	updatedAt?: string;
	webhookUrl?: string;
}

export interface CreateRevenueConfigData {
	webhookSecret?: string;
	isLiveMode?: boolean;
	isActive?: boolean;
}

export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
}

export interface OnboardingFlowProps {
	currentStep: OnboardingStep;
	setCurrentStep: (step: OnboardingStep) => void;
	webhookSecret: string;
	setWebhookSecret: (secret: string) => void;
	isLiveMode: boolean;
	setIsLiveMode: (mode: boolean) => void;
	copied: boolean;
	copyToClipboard: (text: string, label: string) => void;
	webhookUrl: string;
}

export interface ConfigurationSummaryProps {
	webhookToken: string;
	isLiveMode: boolean;
	webhookUrl: string;
}
