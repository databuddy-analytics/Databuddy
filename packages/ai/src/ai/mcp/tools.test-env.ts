process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.BULLMQ_REDIS_URL ??= process.env.REDIS_URL;
process.env.DATABASE_URL ??=
	"postgres://databuddy:databuddy_dev_password@localhost:5432/databuddy_test";
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.NODE_ENV ??= "test";
