import { sso } from "@better-auth/sso";
import { db, eq } from "@databuddy/db";
import {
	member as memberTable,
	organization as organizationTable,
	user,
} from "@databuddy/db/schema";
import {
	InvitationEmail,
	MagicLinkEmail,
	OtpEmail,
	ResetPasswordEmail,
	VerificationEmail,
} from "@databuddy/email";
import {
	type NotificationResult,
	sendSlackWebhook,
} from "@databuddy/notifications";
import { getRedisCache, rateLimit } from "@databuddy/redis";
import { createId } from "@databuddy/shared/utils/ids";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { log } from "evlog";
import {
	customSession,
	emailOTP,
	lastLoginMethod,
	magicLink,
	multiSession,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { Resend } from "resend";
import { ac, admin, member, owner, viewer } from "./permissions";

function generateOrgSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 48);
}

function getOrgNameFromUser(userName: string, email: string): string {
	if (userName?.trim()) {
		return `${userName.trim()}'s Workspace`;
	}
	const emailPrefix = email.split("@").at(0) ?? "user";
	return `${emailPrefix}'s Workspace`;
}

function isProduction() {
	return process.env.NODE_ENV === "production";
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

function notifySignUpSlackAction(input: {
	userId: string;
	email: string;
	name: string | null;
	organizationId: string;
}): void {
	if (!SLACK_WEBHOOK_URL) {
		return;
	}

	sendSlackWebhook(SLACK_WEBHOOK_URL, {
		title: "New sign-up",
		message: "A new user created an account.",
		priority: "normal",
		metadata: {
			email: input.email,
			name: input.name ?? "—",
			userId: input.userId,
			organizationId: input.organizationId,
		},
	})
		.then((result: NotificationResult) => {
			if (!result.success) {
				console.error(
					"Failed to send Slack notification for sign-up:",
					result.error
				);
			}
		})
		.catch((error) => {
			console.error("Failed to send Slack notification for sign-up:", error);
		});
}

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	rateLimit: {
		window: 60,
		max: 100,
		customStorage: {
			get: async (key) => {
				const value = await getRedisCache().get(key);
				return value ? JSON.parse(value) : null;
			},
			// TTL is 2x the longest window so counters survive the full window
			// without lingering indefinitely.
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
		},
	},
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google", "github"],
			allowDifferentEmails: true,
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (createdUser) => {
					const orgId = createId();
					const orgName = getOrgNameFromUser(
						createdUser.name,
						createdUser.email
					);

					await db.transaction(async (tx) => {
						await tx.insert(organizationTable).values({
							id: orgId,
							name: orgName,
							slug: generateOrgSlug(orgName),
							createdAt: new Date(),
						});

						await tx.insert(memberTable).values({
							id: createId(),
							organizationId: orgId,
							userId: createdUser.id,
							role: "owner",
							createdAt: new Date(),
						});
					});

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
							where: eq(memberTable.userId, sessionData.userId),
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
					} catch (error) {
						console.error(
							"Failed to set active organization for session:",
							error
						);
					}

					return { data: sessionData };
				},
			},
		},
	},
	user: {
		deleteUser: {
			enabled: true,
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
			enabled: isProduction(),
			domain: ".databuddy.cc",
		},
		cookiePrefix: isProduction() ? "databuddy" : "databuddy-dev",
		useSecureCookies: isProduction(),
	},
	trustedOrigins: [
		"https://databuddy.cc",
		"https://app.databuddy.cc",
		"https://api.databuddy.cc",
	],
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 32,
		autoSignIn: false,
		requireEmailVerification: process.env.NODE_ENV === "production",
		sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
			const { success } = await rateLimit(`reset:${user.email}`, 3, 3600);
			if (!success) {
				log.warn({
					service: "auth",
					auth_rate_limited: true,
					auth_callback: "reset_password",
					auth_rate_limit_email: user.email,
				});
				return;
			}

			const resend = new Resend(process.env.RESEND_API_KEY as string);
			await resend.emails.send({
				from: "no-reply@databuddy.cc",
				to: user.email,
				subject: "Reset your password",
				react: ResetPasswordEmail({ url }),
			});
		},
	},
	emailVerification: {
		sendOnSignUp: process.env.NODE_ENV === "production",
		sendOnSignIn: process.env.NODE_ENV === "production",
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({
			user,
			url,
		}: {
			user: any;
			url: string;
		}) => {
			const { success } = await rateLimit(`verify:${user.email}`, 3, 900);
			if (!success) {
				log.warn({
					service: "auth",
					auth_rate_limited: true,
					auth_callback: "verify_email",
					auth_rate_limit_email: user.email,
				});
				return;
			}

			const resend = new Resend(process.env.RESEND_API_KEY as string);
			await resend.emails.send({
				from: "no-reply@databuddy.cc",
				to: user.email,
				subject: "Verify your email",
				react: VerificationEmail({ url }),
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
			async sendVerificationOTP({ email, otp, type }) {
				const { success } = await rateLimit(`otp:${email}`, 3, 900);
				if (!success) {
					log.warn({
						service: "auth",
						auth_rate_limited: true,
						auth_callback: "verification_otp",
						auth_otp_type: type,
						auth_rate_limit_email: email,
					});
					return;
				}

				const resend = new Resend(process.env.RESEND_API_KEY as string);

				let subject = "Your verification code";
				if (type === "sign-in") {
					subject = "Sign in to Databuddy";
				} else if (type === "email-verification") {
					subject = "Verify your email address";
				} else if (type === "forget-password") {
					subject = "Reset your password";
				}

				resend.emails
					.send({
						from: "no-reply@databuddy.cc",
						to: email,
						subject,
						react: OtpEmail({ otp }),
					})
					.catch((error) => {
						console.error("Failed to send OTP email:", error);
					});
			},
		}),
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				const { success } = await rateLimit(`magic:${email}`, 3, 900);
				if (!success) {
					log.warn({
						service: "auth",
						auth_rate_limited: true,
						auth_callback: "magic_link",
						auth_rate_limit_email: email,
					});
					return;
				}

				const resend = new Resend(process.env.RESEND_API_KEY as string);
				resend.emails.send({
					from: "no-reply@databuddy.cc",
					to: email,
					subject: "Login to Databuddy",
					react: MagicLinkEmail({ url }),
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
		customSession(async ({ user: sessionUser, session }) => {
			const [dbUser] = await db
				.select({ role: user.role, twoFactorEnabled: user.twoFactorEnabled })
				.from(user)
				.where(eq(user.id, session.userId))
				.limit(1);
			return {
				role: dbUser?.role,
				user: {
					...sessionUser,
					role: dbUser?.role,
					twoFactorEnabled: dbUser?.twoFactorEnabled ?? false,
				},
				session,
			};
		}),
		organization({
			creatorRole: "owner",
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
			sendInvitationEmail: async ({
				email,
				inviter,
				organization,
				invitation,
			}) => {
				const { success } = await rateLimit(
					`invite:${organization.id}`,
					5,
					3600
				);
				if (!success) {
					log.warn({
						service: "auth",
						auth_rate_limited: true,
						auth_callback: "invitation",
						auth_organization_id: organization.id,
					});
					return;
				}

				const invitationLink = `https://app.databuddy.cc/invitations/${invitation.id}`;
				const resend = new Resend(process.env.RESEND_API_KEY as string);
				await resend.emails.send({
					from: "no-reply@databuddy.cc",
					to: email,
					subject: `You're invited to join ${organization.name}`,
					react: InvitationEmail({
						inviterName: inviter.user.name ?? "",
						organizationName: organization.name,
						invitationLink,
					}),
				});
			},
		}),
	],
});

export const websitesApi = {
	hasPermission: auth.api.hasPermission,
};

export type User = (typeof auth)["$Infer"]["Session"]["user"] & {
	role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
	twoFactorEnabled?: boolean;
};
export type Session = (typeof auth)["$Infer"]["Session"];
