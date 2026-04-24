import { redisStorage } from "@better-auth/redis-storage";
import { sso } from "@better-auth/sso";
import { db, eq } from "@databuddy/db";
import {
	member as memberTable,
	organization as organizationTable,
} from "@databuddy/db/schema";
import {
	DeleteAccountEmail,
	InvitationEmail,
	MagicLinkEmail,
	OtpEmail,
	render,
	ResetPasswordEmail,
	VerificationEmail,
} from "@databuddy/email";
import { SlackProvider } from "@databuddy/notifications";
import { getRedisCache, ratelimit } from "@databuddy/redis";
import { createId } from "@databuddy/shared/utils/ids";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
	const suffix = createId().slice(0, 6);
	return `${base}-${suffix}`;
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

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
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

					try {
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
					} catch (error) {
						log.error({
							service: "auth",
							auth_hook: "user.create.after",
							auth_user_id: createdUser.id,
							auth_org_id: orgId,
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
			sendDeleteAccountVerification: async ({ user: targetUser, url }) => {
				const resend = new Resend(process.env.RESEND_API_KEY as string);
				await resend.emails.send({
					from: "no-reply@databuddy.cc",
					to: targetUser.email,
					subject: "[Action required] Confirm account deletion",
					html: await render(DeleteAccountEmail({ url })),
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
			const { success } = await ratelimit(`reset:${user.email}`, 3, 3600);
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
				subject: "[Action required] Reset your password",
				html: await render(ResetPasswordEmail({ url })),
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
			const { success } = await ratelimit(`verify:${user.email}`, 3, 900);
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
				subject: "[Action required] Verify your email to get started",
				html: await render(VerificationEmail({ url })),
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
				const { success } = await ratelimit(`otp:${email}`, 3, 900);
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

				let subject = `${otp} is your verification code`;
				if (type === "sign-in") {
					subject = `${otp} — Sign in to Databuddy`;
				} else if (type === "email-verification") {
					subject = `${otp} — Verify your email`;
				} else if (type === "forget-password") {
					subject = `${otp} — Reset your password`;
				}

				const otpHtml = await render(OtpEmail({ otp }));
				resend.emails
					.send({
						from: "no-reply@databuddy.cc",
						to: email,
						subject,
						html: otpHtml,
					})
					.catch((error) => {
						console.error("Failed to send OTP email:", error);
					});
			},
		}),
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				const { success } = await ratelimit(`magic:${email}`, 3, 900);
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
					subject: "Your sign-in link for Databuddy",
					html: await render(MagicLinkEmail({ url })),
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
				const { success } = await ratelimit(
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
					subject: `${inviter.user.name ?? "Someone"} invited you to join ${organization.name}`,
					html: await render(
						InvitationEmail({
							inviterName: inviter.user.name ?? "",
							organizationName: organization.name,
							invitationLink,
						})
					),
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
