import type { Session, User } from "./auth";

export interface SessionData {
	role: string;
	user: User;
	session: Session;
}

export interface AuthError {
	message: string;
	code?: string;
	status?: number;
}

export type Provider = "email" | "google" | "github" | "credentials";

export interface SignInOptions {
	redirect?: boolean;
	redirectUrl?: string;
	provider?: Provider;
}

export interface SignUpOptions {
	redirect?: boolean;
	redirectUrl?: string;
}
