import { sso } from "@better-auth/sso";
import { db, eq, inArray, user, websites } from "@databuddy/db";
import {
    InvitationEmail,
    MagicLinkEmail,
    OtpEmail,
    ResetPasswordEmail,
    sanitizeEmailText,
    VerificationEmail,
} from "@databuddy/email";
import { getRedisCache } from "@databuddy/redis";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
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

function isProduction() {
    return process.env.NODE_ENV === "production";
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    account: {
        accountLinking: {
            enabled: true,
            trustedProviders: ["google", "github"],
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async () => {
                    // const resend = new Resend(process.env.RESEND_API_KEY as string);
                    // await resend.emails.send({
                    //     from: "Databuddy <noreply@databuddy.cc>",
                    //     to: user.email,
                    //     subject: "Welcome to Databuddy",
                    //     react: WelcomeEmail({ username: user.name, url: process.env.BETTER_AUTH_URL as string }),
                    // });
                },
            },
        },
    },
    user: {
        deleteUser: {
            enabled: true,
            beforeDelete: async (user) => {
                try {
                    const userWebsites = await db.query.websites.findMany({
                        where: eq(websites.userId, user.id),
                    });

                    if (userWebsites.length > 0) {
                        await db.delete(websites).where(
                            inArray(
                                websites.id,
                                userWebsites.map((w) => w.id)
                            )
                        );
                    }
                } catch (error) {
                    console.error(error);
                }
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
        cookiePrefix: "databuddy",
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
            const resend = new Resend(process.env.RESEND_API_KEY as string);
            await resend.emails.send({
                from: "noreply@databuddy.cc",
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
            const resend = new Resend(process.env.RESEND_API_KEY as string);
            await resend.emails.send({
                from: "noreply@databuddy.cc",
                to: user.email,
                subject: "Verify your email",
                react: VerificationEmail({ url }),
            });
        },
    },
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
        },
        storeSessionInDatabase: true,
        preserveSessionInDatabase: true,
    },
    secondaryStorage: {
        get: async (key) => {
            const value = await getRedisCache()?.get(key);
            return value ? value : null;
        },
        set: async (key, value, ttl = 60 * 60 * 24) => {
            await getRedisCache()?.setex(key, ttl, value);
        },
        delete: async (key) => {
            await getRedisCache()?.del(key);
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
            // biome-ignore lint/suspicious/useAwait: we don't want to await here
            async sendVerificationOTP({ email, otp, type }) {
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
                        from: "noreply@databuddy.cc",
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
            sendMagicLink: ({ email, url }) => {
                const resend = new Resend(process.env.RESEND_API_KEY as string);
                resend.emails.send({
                    from: "noreply@databuddy.cc",
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
                const invitationLink = `https://app.databuddy.cc/invitations/${invitation.id}`;
                const safeOrganizationName = sanitizeEmailText(organization.name);
                const safeInviterName = sanitizeEmailText(inviter.user.name ?? "");
                const resend = new Resend(process.env.RESEND_API_KEY as string);
                await resend.emails.send({
                    from: "noreply@databuddy.cc",
                    to: email,
                    subject: `You're invited to join ${safeOrganizationName}`,
                    react: InvitationEmail({
                        inviterName: safeInviterName,
                        organizationName: safeOrganizationName,
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
