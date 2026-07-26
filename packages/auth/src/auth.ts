import { randomUUID } from "node:crypto";
import { redisStorage } from "@better-auth/redis-storage";
import { sso } from "@better-auth/sso";
import { and, db, eq, like } from "@databuddy/db";
// biome-ignore lint/performance/noNamespaceImport: Better Auth's Drizzle adapter expects a schema object map.
import * as schema from "@databuddy/db/schema";
import {
	member as memberTable,
	organization as organizationTable,
	verification as verificationTable,
} from "@databuddy/db/schema";
import {
	AUTH_EMAIL_EXPIRY_SECONDS,
	DeleteAccountEmail,
	InvitationEmail,
	MagicLinkEmail,
	OtpEmail,
	render,
	ResetPasswordEmail,
	VerificationEmail,
} from "@databuddy/email";
import { config } from "@databuddy/env/app";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { SlackProvider } from "@databuddy/notifications";
import {
	getRedisCache,
	invalidateOrganizationMembershipCaches,
	ratelimit,
} from "@databuddy/redis";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import {
	emailOTP,
	lastLoginMethod,
	magicLink,
	multiSession,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { log } from "evlog";
import { Resend } from "resend";
import { ac, admin, member, owner, viewer } from "./permissions";

function generateOrgSlug(name: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 48);
	const suffix = randomUUID().replace(/-/g, "").slice(0, 16);
	return `${base}-${suffix}`;
}

const ORG_SLUG_MAX_ATTEMPTS = 5;
const SLUG_COLLISION_PATTERN = /organizations_slug_unique/;

async function provisionDefaultOrg(input: {
	userId: string;
	name: string;
	email: string;
}): Promise<string> {
	const orgName = getOrgNameFromUser(input.name, input.email);
	const orgId = randomUUID();

	for (let attempt = 1; attempt <= ORG_SLUG_MAX_ATTEMPTS; attempt++) {
		try {
			await db.transaction(async (tx) => {
				await tx.insert(organizationTable).values({
					id: orgId,
					name: orgName,
					slug: generateOrgSlug(orgName),
					createdAt: new Date(),
				});
				await tx.insert(memberTable).values({
					id: randomUUID(),
					organizationId: orgId,
					userId: input.userId,
					role: "owner",
					createdAt: new Date(),
				});
			});
			return orgId;
		} catch (error) {
			const isSlugCollision =
				error instanceof Error && SLUG_COLLISION_PATTERN.test(error.message);
			if (!isSlugCollision || attempt === ORG_SLUG_MAX_ATTEMPTS) {
				throw error;
			}
		}
	}

	throw new Error("Failed to provision organization after slug retries");
}

function getOrgNameFromUser(userName: string, email: string): string {
	if (userName?.trim()) {
		return `${userName.trim()}'s Organization`;
	}
	const emailPrefix = email.split("@").at(0) ?? "user";
	return `${emailPrefix}'s Organization`;
}

function isProduction() {
	return process.env.NODE_ENV === "production";
}

function isSelfHosted() {
	return readBooleanEnv("SELFHOST");
}

function shouldRequireEmailVerification() {
	if (process.env.REQUIRE_EMAIL_VERIFICATION != null) {
		return readBooleanEnv("REQUIRE_EMAIL_VERIFICATION");
	}
	return isProduction() && !isSelfHosted();
}

type EmailTemplate = Parameters<typeof render>[0];

async function enforceAuthEmailRateLimit(input: {
	callback: string;
	email?: string;
	key: string;
	limit: number;
	windowSeconds: number;
}): Promise<void> {
	const { success } = await ratelimit(
		input.key,
		input.limit,
		input.windowSeconds
	);
	if (success) {
		return;
	}

	log.warn({
		service: "auth",
		auth_rate_limited: true,
		auth_callback: input.callback,
		...(input.email ? { auth_rate_limit_email: input.email } : {}),
	});
	throw new APIError("TOO_MANY_REQUESTS", {
		message: "Too many email requests. Please try again later.",
	});
}

async function sendAuthEmail(input: {
	subject: string;
	template: EmailTemplate;
	to: string;
}): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		log.error({
			service: "auth",
			auth_email_delivery_failed: true,
			email_provider_error: "RESEND_API_KEY is not configured",
		});
		throw new APIError("SERVICE_UNAVAILABLE", {
			message: "Email delivery is temporarily unavailable. Please try again.",
		});
	}
	const [html, text] = await Promise.all([
		render(input.template),
		render(input.template, { plainText: true }),
	]);
	const resend = new Resend(apiKey);
	const result = await resend.emails.send({
		from: config.email.from,
		to: input.to,
		subject: input.subject,
		html,
		text,
	});

	if (result.error) {
		log.error({
			service: "auth",
			auth_email_delivery_failed: true,
			email_provider_error: result.error.message,
		});
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "We could not send this email. Please try again.",
		});
	}
}

function formatInvitationRole(role: string | string[]): string {
	const roles = Array.isArray(role) ? role : [role];
	return roles
		.map((value) => value.replaceAll(/[_-]+/g, " ").toLowerCase())
		.join(", ");
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

function notifySlack(
	title: string,
	message: string,
	priority: "high" | "normal",
	metadata: Record<string, string>
): void {
	if (!SLACK_WEBHOOK_URL) {
		return;
	}

	new SlackProvider({ webhookUrl: SLACK_WEBHOOK_URL })
		.send({ title, message, priority, metadata })
		.then((result) => {
			if (!result.success) {
				console.error(
					`Failed to send Slack notification (${title}):`,
					result.error
				);
			}
		})
		.catch((error) => {
			console.error(`Failed to send Slack notification (${title}):`, error);
		});
}

function notifySignUpSlackAction(input: {
	userId: string;
	email: string;
	name: string | null;
	organizationId: string;
}): void {
	notifySlack("New sign-up", "A new user created an account.", "normal", {
		email: input.email,
		name: input.name ?? "—",
		userId: input.userId,
		organizationId: input.organizationId,
	});
}

async function purgeOutstandingResetTokens(userId: string): Promise<void> {
	try {
		await db
			.delete(verificationTable)
			.where(
				and(
					like(verificationTable.identifier, "reset-password:%"),
					eq(verificationTable.value, userId)
				)
			);
	} catch (error) {
		log.error({
			service: "auth",
			auth_hook: "purge_reset_tokens",
			auth_user_id: userId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function invalidateMemberCaches(member: {
	organizationId: string;
	userId: string;
}): Promise<void> {
	const result = await invalidateOrganizationMembershipCaches(member);
	if (result.failed > 0) {
		log.warn({
			service: "auth",
			auth_hook: "organization.member.cache_invalidation",
			auth_user_id: member.userId,
			auth_org_id: member.organizationId,
			cache_invalidations_failed: result.failed,
			cache_invalidations_attempted: result.attempted,
		});
	}
}

type AuthLogLevel = "info" | "warn" | "error" | "debug";

function forwardAuthLog(
	level: AuthLogLevel,
	message: string,
	...args: unknown[]
): void {
	const cause = args.find((arg): arg is Error => arg instanceof Error);
	const fields = {
		service: "auth",
		auth_logger: message,
		...(cause && { error: cause.message, error_stack: cause.stack }),
	};
	if (level === "error") {
		log.error(fields);
		return;
	}
	if (level === "warn") {
		log.warn(fields);
		return;
	}
	log.info(fields);
}

export const auth = betterAuth({
	logger: {
		log: forwardAuthLog,
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	secondaryStorage: redisStorage({
		client: getRedisCache(),
		keyPrefix: "ba:",
	}),
	session: {
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},
	rateLimit: {
		window: 60,
		max: 100,
		customStorage: {
			get: async (key) => {
				const value = await getRedisCache().get(key);
				return value ? JSON.parse(value) : null;
			},
			set: async (key, value) => {
				await getRedisCache().set(key, JSON.stringify(value), "EX", 120);
			},
		},
		customRules: {
			"/sign-up/email": { window: 60, max: 3 },
			"/sign-in/email": { window: 10, max: 3 },
			"/forget-password": { window: 60, max: 3 },
			"/magic-link/send": { window: 60, max: 3 },
			"/email-otp/send": { window: 60, max: 3 },
			"/organization/invite-member": { window: 3600, max: 5 },
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
			allowDifferentEmails: true,
			requireLocalEmailVerified: true,
		},
	},
	databaseHooks: {
		account: {
			update: {
				after: async (account) => {
					if (account.providerId !== "credential" || !account.userId) {
						return;
					}
					await purgeOutstandingResetTokens(account.userId);
				},
			},
		},
		user: {
			create: {
				after: async (createdUser) => {
					let orgId: string;
					try {
						orgId = await provisionDefaultOrg({
							userId: createdUser.id,
							name: createdUser.name,
							email: createdUser.email,
						});
					} catch (error) {
						log.error({
							service: "auth",
							auth_hook: "user.create.after",
							auth_user_id: createdUser.id,
							error: error instanceof Error ? error.message : String(error),
						});
						return;
					}

					notifySignUpSlackAction({
						userId: createdUser.id,
						email: createdUser.email,
						name: createdUser.name,
						organizationId: orgId,
					});
				},
			},
		},
		session: {
			create: {
				before: async (sessionData) => {
					if (sessionData.activeOrganizationId) {
						return { data: sessionData };
					}

					try {
						const userOrg = await db.query.member.findFirst({
							where: { userId: sessionData.userId },
							columns: { organizationId: true },
						});

						if (userOrg) {
							return {
								data: {
									...sessionData,
									activeOrganizationId: userOrg.organizationId,
								},
							};
						}

						const user = await db.query.user.findFirst({
							where: { id: sessionData.userId },
							columns: { id: true, name: true, email: true },
						});
						if (!user) {
							return { data: sessionData };
						}

						const orgId = await provisionDefaultOrg({
							userId: user.id,
							name: user.name,
							email: user.email,
						});
						log.info({
							service: "auth",
							auth_hook: "session.create.before",
							auth_user_id: sessionData.userId,
							auth_org_id: orgId,
							message: "Provisioned default org for orphaned account",
						});
						return {
							data: { ...sessionData, activeOrganizationId: orgId },
						};
					} catch (error) {
						log.error({
							service: "auth",
							auth_hook: "session.create.before",
							auth_user_id: sessionData.userId,
							error: error instanceof Error ? error.message : String(error),
						});
					}

					return { data: sessionData };
				},
			},
		},
	},
	user: {
		deleteUser: {
			enabled: true,
			deleteTokenExpiresIn: AUTH_EMAIL_EXPIRY_SECONDS.accountDeletion,
			sendDeleteAccountVerification: async ({ user: targetUser, url }) => {
				await sendAuthEmail({
					to: targetUser.email,
					subject: "[Action required] Confirm account deletion",
					template: DeleteAccountEmail({ url }),
				});
			},
			beforeDelete: async (userToDelete) => {
				await notifySlack(
					"Account deleted",
					"A user deleted their account.",
					"high",
					{
						email: userToDelete.email,
						name: userToDelete.name ?? "—",
						userId: userToDelete.id,
					}
				);
			},
		},
	},
	appName: "databuddy.cc",
	onAPIError: {
		throw: false,
		onError: (error) => {
			console.error(error);
		},
		errorURL: "/auth/error",
	},
	advanced: {
		crossSubDomainCookies: {
			enabled: isProduction() && !isSelfHosted(),
			domain: process.env.BETTER_AUTH_COOKIE_DOMAIN ?? ".databuddy.cc",
		},
		cookiePrefix: isProduction() ? "databuddy" : "databuddy-dev",
		useSecureCookies: isProduction(),
	},
	trustedOrigins: [
		"https://databuddy.cc",
		config.urls.dashboard,
		config.urls.api,
	],
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			accessType: "offline",
			prompt: "select_account consent",
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 128,
		autoSignIn: false,
		requireEmailVerification: shouldRequireEmailVerification(),
		resetPasswordTokenExpiresIn: AUTH_EMAIL_EXPIRY_SECONDS.passwordReset,
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }: { user: { id: string } }) => {
			await purgeOutstandingResetTokens(user.id);
		},
		sendResetPassword: async ({ user, url }) => {
			await enforceAuthEmailRateLimit({
				callback: "reset_password",
				email: user.email,
				key: `reset:${user.email}`,
				limit: 3,
				windowSeconds: 3600,
			});

			await sendAuthEmail({
				to: user.email,
				subject: "[Action required] Reset your password",
				template: ResetPasswordEmail({ url }),
			});
		},
	},
	emailVerification: {
		expiresIn: AUTH_EMAIL_EXPIRY_SECONDS.emailVerification,
		sendOnSignUp: process.env.NODE_ENV === "production",
		sendOnSignIn: process.env.NODE_ENV === "production",
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await enforceAuthEmailRateLimit({
				callback: "verify_email",
				email: user.email,
				key: `verify:${user.email}`,
				limit: 3,
				windowSeconds: 900,
			});

			await sendAuthEmail({
				to: user.email,
				subject: "[Action required] Verify your email to get started",
				template: VerificationEmail({ url }),
			});
		},
	},
	plugins: [
		multiSession({
			maximumSessions: 5,
		}),
		lastLoginMethod({
			customResolveMethod: (ctx) => {
				if (
					ctx.path === "/magic-link/verify" ||
					ctx.path?.includes("/magic-link")
				) {
					return "magic-link";
				}
				return null;
			},
		}),
		emailOTP({
			expiresIn: AUTH_EMAIL_EXPIRY_SECONDS.oneTimeCode,
			async sendVerificationOTP({ email, otp, type }) {
				await enforceAuthEmailRateLimit({
					callback: `verification_otp_${type}`,
					email,
					key: `otp:${email}`,
					limit: 3,
					windowSeconds: 900,
				});

				let subject = `${otp} is your verification code`;
				if (type === "sign-in") {
					subject = `${otp} — Sign in to Databuddy`;
				} else if (type === "email-verification") {
					subject = `${otp} — Verify your email`;
				} else if (type === "forget-password") {
					subject = `${otp} — Reset your password`;
				}

				await sendAuthEmail({
					to: email,
					subject,
					template: OtpEmail({ otp, type }),
				});
			},
		}),
		magicLink({
			expiresIn: AUTH_EMAIL_EXPIRY_SECONDS.magicLink,
			sendMagicLink: async ({ email, url }) => {
				await enforceAuthEmailRateLimit({
					callback: "magic_link",
					email,
					key: `magic:${email}`,
					limit: 3,
					windowSeconds: 900,
				});

				await sendAuthEmail({
					to: email,
					subject: "Your sign-in link for Databuddy",
					template: MagicLinkEmail({ url }),
				});
			},
		}),
		sso({
			organizationProvisioning: {
				disabled: false,
				defaultRole: "member",
			},
		}),
		twoFactor(),
		organization({
			creatorRole: "owner",
			invitationExpiresIn: AUTH_EMAIL_EXPIRY_SECONDS.invitation,
			teams: {
				enabled: false,
			},
			ac,
			roles: {
				owner,
				admin,
				member,
				viewer,
			},
			organizationHooks: {
				afterAddMember: ({ member }) => invalidateMemberCaches(member),
				afterCreateOrganization: ({ member }) => invalidateMemberCaches(member),
				afterRemoveMember: ({ member }) => invalidateMemberCaches(member),
				afterUpdateMemberRole: ({ member }) => invalidateMemberCaches(member),
			},
			sendInvitationEmail: async ({
				email,
				inviter,
				organization,
				invitation,
			}) => {
				const invitationLink = `${config.urls.dashboard}/invitations/${invitation.id}`;
				await sendAuthEmail({
					to: email,
					subject: `${inviter.user.name ?? "Someone"} invited you to join ${organization.name}`,
					template: InvitationEmail({
						inviterName: inviter.user.name ?? "",
						organizationName: organization.name,
						invitationLink,
						recipientEmail: email,
						role: formatInvitationRole(invitation.role),
					}),
				});
			},
		}),
	],
});

export const websitesApi = {
	hasPermission: auth.api.hasPermission,
};

export type User = (typeof auth)["$Infer"]["Session"]["user"];
export type Session = (typeof auth)["$Infer"]["Session"];
