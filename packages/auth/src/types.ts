import type { Session, User } from "./auth";

export interface SessionData {
	role: string;
	session: Session;
	user: User;
}

export interface AuthError {
	code?: string;
	message: string;
	status?: number;
}

export type Provider = "email" | "google" | "github" | "credentials";

export interface SignInOptions {
	provider?: Provider;
	redirect?: boolean;
	redirectUrl?: string;
}

export interface SignUpOptions {
	redirect?: boolean;
	redirectUrl?: string;
}
