"use client";

import { authClient, signIn, signOut, signUp } from "./auth-client";

interface TwoFactorResponse {
	data?: {
		totpURI?: string;
		backupCodes?: string[];
		twoFactorEnabled: boolean;
	};
	error?: {
		message: string;
	};
}

/**
 * Helper function to sign in with email and password with simplified redirect handling
 */
export async function loginWithEmail(
	email: string,
	password: string,
	options?: {
		redirectUrl?: string;
		router?: any; // Next.js router
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await signIn.email({
			email,
			password,
			fetchOptions: {
				onSuccess: () => {
					if (options?.router && options.redirectUrl) {
						options.router.push(options.redirectUrl);
						options.router.refresh();
					}
				},
			},
		});

		return { success: !result?.error, data: result };
	} catch (error) {
		if (options?.onError) {
			options.onError(error);
		}
		return { success: false, error };
	}
}

/**
 * Helper function to sign up with email and password with simplified redirect handling
 */
export async function registerWithEmail(
	email: string,
	password: string,
	name: string,
	options?: {
		redirectUrl?: string;
		router?: any; // Next.js router
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await signUp.email({
			email,
			password,
			name,
			fetchOptions: {
				onSuccess: () => {
					if (options?.router && options.redirectUrl) {
						options.router.push(options.redirectUrl);
						options.router.refresh();
					}
				},
			},
		});

		return { success: !result?.error, data: result };
	} catch (error) {
		if (options?.onError) {
			options.onError(error);
		}
		return { success: false, error };
	}
}

/**
 * Helper function to sign out with simplified redirect handling
 */
export async function logout(options?: {
	redirectUrl?: string;
	router?: any; // Next.js router
	onError?: (error: any) => void;
}) {
	try {
		await signOut();

		if (options?.router && options.redirectUrl) {
			options.router.push(options.redirectUrl);
		}

		return { success: true };
	} catch (error) {
		if (options?.onError) {
			options.onError(error);
		}
		return { success: false, error };
	}
}

/**
 * Helper function to sign in with Google with simplified redirect handling
 */
export function loginWithGoogle(options?: {
	redirectUrl?: string;
	router?: any; // Next.js router
	onError?: (error: any) => void;
}) {
	try {
		return signIn.social({
			provider: "google",
			fetchOptions: {
				onSuccess: () => {
					if (options?.router && options.redirectUrl) {
						options.router.push(options.redirectUrl);
						options.router.refresh();
					}
				},
			},
		});
	} catch (error) {
		if (options?.onError) {
			options.onError(error);
		}
		return { success: false, error };
	}
}

/**
 * Helper function to sign in with GitHub with simplified redirect handling
 */
export function loginWithGithub(options?: {
	redirectUrl?: string;
	router?: any; // Next.js router
	onError?: (error: any) => void;
}) {
	try {
		return signIn.social({
			provider: "github",
			fetchOptions: {
				onSuccess: () => {
					if (options?.router && options.redirectUrl) {
						options.router.push(options.redirectUrl);
						options.router.refresh();
					}
				},
			},
		});
	} catch (error) {
		if (options?.onError) {
			options.onError(error);
		}
		return { success: false, error };
	}
}

/**
 * Helper function to enable 2FA for a user
 */
export async function enableTwoFactor(
	password: string,
	options?: {
		onSuccess?: (data: TwoFactorResponse["data"]) => void;
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await authClient.twoFactor.enable({
			password,
		});

		if (result.data) {
			options?.onSuccess?.({
				...result.data,
				twoFactorEnabled: false, // Will be true after verification
			});
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}

/**
 * Helper function to verify TOTP code
 */
export async function verifyTwoFactorCode(
	code: string,
	options?: {
		trustDevice?: boolean;
		onSuccess?: () => void;
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await authClient.twoFactor.verifyTotp({
			code,
			trustDevice: options?.trustDevice,
		});

		if (result.data) {
			options?.onSuccess?.();
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}

/**
 * Helper function to verify backup code
 */
export async function verifyBackupCode(
	code: string,
	options?: {
		onSuccess?: () => void;
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await authClient.twoFactor.verifyBackupCode({
			code,
		});

		if (result.data) {
			options?.onSuccess?.();
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}

/**
 * Helper function to send OTP
 */
export async function sendOTP(options?: {
	onSuccess?: () => void;
	onError?: (error: any) => void;
}) {
	try {
		const result = await authClient.twoFactor.sendOtp();

		if (result.data) {
			options?.onSuccess?.();
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}

/**
 * Helper function to verify OTP
 */
export async function verifyOTP(
	code: string,
	options?: {
		onSuccess?: () => void;
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await authClient.twoFactor.verifyOtp({
			code,
		});

		if (result.data) {
			options?.onSuccess?.();
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}

/**
 * Helper function to generate backup codes
 */
export async function generateBackupCodes(
	password: string,
	options?: {
		onSuccess?: (backupCodes: string[]) => void;
		onError?: (error: any) => void;
	}
) {
	try {
		const result = await authClient.twoFactor.generateBackupCodes({
			password,
		});

		if (result.data?.backupCodes) {
			options?.onSuccess?.(result.data.backupCodes);
		} else if (result.error) {
			options?.onError?.(result.error);
		}

		return { success: !!result.data, data: result };
	} catch (error) {
		options?.onError?.(error);
		return { success: false, error };
	}
}
