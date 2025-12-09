#!/usr/bin/env bun

import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import chalk from "chalk";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Docker = require("dockerode");

const isWindows = process.platform === "win32";
const docker = new Docker();

function log(message: string) {
	console.log(message);
}

function logStep(step: number, total: number, message: string) {
	log(`\n${chalk.cyan(`[${step}/${total}]`)} ${chalk.cyan(message)}`);
}

async function checkCommand(command: string): Promise<boolean> {
	try {
		if (isWindows) {
			await $`where ${command}`.quiet();
		} else {
			await $`which ${command}`.quiet();
		}
		return true;
	} catch {
		return false;
	}
}

async function checkDockerRunning(): Promise<boolean> {
	try {
		await $`docker info`.quiet();
		return true;
	} catch {
		return false;
	}
}

async function checkContainerHealth(containerName: string): Promise<boolean> {
	try {
		const container = docker.getContainer(containerName);
		const inspect = await container.inspect();

		// Check health status if healthcheck is configured
		if (inspect.State.Health) {
			return inspect.State.Health.Status === "healthy";
		}

		// Fall back to checking if container is running
		return inspect.State.Status === "running";
	} catch {
		// Container might not exist yet or inspect failed
		return false;
	}
}

async function waitForService(
	service: string,
	containerName: string,
	maxAttempts = 60
): Promise<boolean> {
	log(chalk.yellow(`Waiting for ${service} to be ready...`));

	// First, wait for container to exist
	let containerExists = false;
	for (let i = 0; i < 10; i++) {
		try {
			const container = docker.getContainer(containerName);
			await container.inspect();
			containerExists = true;
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	if (!containerExists) {
		log(
			chalk.yellow(
				`⚠️  Container ${containerName} not found, continuing anyway...`
			)
		);
		return false;
	}

	// Now wait for health check
	for (let i = 0; i < maxAttempts; i++) {
		const isHealthy = await checkContainerHealth(containerName);
		if (isHealthy) {
			log(chalk.green(`${service} is ready!`));
			return true;
		}
		// Show progress every 5 seconds
		if (i > 0 && i % 5 === 0) {
			log(chalk.gray(`   Still waiting... (${i * 2}s)`));
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	return false;
}

async function main() {
	log(chalk.bold("🚀 Databuddy Setup Script"));
	log(chalk.cyan("=".repeat(50)));

	const steps = [
		"Check prerequisites",
		"Install dependencies",
		"Set up environment variables",
		"Start Docker services",
		"Wait for services to be ready",
		"Set up database schema",
		"Initialize ClickHouse",
		"Build SDK",
	];

	let currentStep = 0;

	// Step 1: Check prerequisites
	currentStep += 1;
	logStep(currentStep, steps.length, steps[0] ?? "");

	const hasDocker = await checkCommand("docker");
	const hasDockerCompose =
		(await checkCommand("docker-compose")) ||
		(await checkCommand("docker compose"));

	if (!hasDocker) {
		log(chalk.red("❌ Docker is not installed. Please install Docker first."));
		process.exit(1);
	}

	if (!hasDockerCompose) {
		log(
			chalk.red(
				"❌ docker-compose is not installed. Please install docker-compose first."
			)
		);
		process.exit(1);
	}

	const dockerRunning = await checkDockerRunning();
	if (!dockerRunning) {
		log(
			chalk.yellow(
				"⚠️  Docker daemon is not running. Please start Docker Desktop."
			)
		);
		log(chalk.yellow("   The script will attempt to start services anyway..."));
	}

	log(chalk.green("✅ Prerequisites check passed"));

	// Step 2: Install dependencies
	currentStep += 1;
	logStep(currentStep, steps.length, steps[1] ?? "");
	log(chalk.blue("Running: bun install"));

	try {
		await $`bun install`;
		log(chalk.green("✅ Dependencies installed successfully"));
	} catch (error) {
		log(chalk.red(`❌ Failed to install dependencies: ${String(error)}`));
		process.exit(1);
	}

	// Step 3: Set up environment variables
	currentStep += 1;
	logStep(currentStep, steps.length, steps[2] ?? "");

	const envExamplePath = join(process.cwd(), ".env.example");
	const envPath = join(process.cwd(), ".env");

	if (!existsSync(envExamplePath)) {
		log(chalk.yellow("⚠️  .env.example not found, skipping environment setup"));
	} else if (existsSync(envPath)) {
		log(chalk.yellow("⚠️  .env already exists, skipping copy"));
	} else {
		try {
			copyFileSync(envExamplePath, envPath);
			log(chalk.green("✅ Created .env from .env.example"));
			log(
				chalk.yellow("⚠️  Please review and update .env with your configuration")
			);
		} catch (error) {
			log(chalk.red(`❌ Failed to create .env: ${String(error)}`));
			process.exit(1);
		}
	}

	// Step 4: Start Docker services
	currentStep += 1;
	logStep(currentStep, steps.length, steps[3] ?? "");

	const dockerComposeCmd = (await checkCommand("docker-compose"))
		? "docker-compose"
		: "docker compose";

	log(chalk.blue(`Running: ${dockerComposeCmd} up -d`));

	try {
		await $`${dockerComposeCmd} up -d`;
		log(chalk.green("✅ Docker services started"));
	} catch (error) {
		log(chalk.red(`❌ Failed to start Docker services: ${String(error)}`));
		log(chalk.yellow("   Make sure Docker is running and try again"));
		process.exit(1);
	}

	// Step 5: Wait for services to be ready
	currentStep += 1;
	logStep(currentStep, steps.length, steps[4] ?? "");

	const postgresReady = await waitForService(
		"PostgreSQL",
		"databuddy-postgres"
	);

	if (!postgresReady) {
		log(
			chalk.yellow(
				"⚠️  PostgreSQL did not become ready in time, continuing anyway..."
			)
		);
	}

	const clickhouseReady = await waitForService(
		"ClickHouse",
		"databuddy-clickhouse"
	);

	if (!clickhouseReady) {
		log(
			chalk.yellow(
				"⚠️  ClickHouse did not become ready in time, continuing anyway..."
			)
		);
	}

	const redisReady = await waitForService("Redis", "databuddy-redis");

	if (!redisReady) {
		log(
			chalk.yellow(
				"⚠️  Redis did not become ready in time, continuing anyway..."
			)
		);
	}

	// Step 6: Set up database schema
	currentStep += 1;
	logStep(currentStep, steps.length, steps[5] ?? "");
	log(chalk.blue("Running: bun run db:push"));

	try {
		await $`bun run db:push`;
		log(chalk.green("✅ Database schema applied"));
	} catch (error) {
		log(chalk.red(`❌ Failed to apply database schema: ${String(error)}`));
		log(
			chalk.yellow(
				"   You may need to wait a bit longer for PostgreSQL to be ready"
			)
		);
		process.exit(1);
	}

	// Step 7: Initialize ClickHouse
	currentStep += 1;
	logStep(currentStep, steps.length, steps[6] ?? "");
	log(chalk.blue("Running: bun run clickhouse:init"));

	try {
		await $`bun run clickhouse:init`;
		log(chalk.green("✅ ClickHouse initialized"));
	} catch (error) {
		log(chalk.red(`❌ Failed to initialize ClickHouse: ${String(error)}`));
		log(
			chalk.yellow(
				"   You may need to wait a bit longer for ClickHouse to be ready"
			)
		);
		process.exit(1);
	}

	// Step 8: Build SDK
	currentStep += 1;
	logStep(currentStep, steps.length, steps[7] ?? "");
	log(chalk.blue("Running: bun run sdk:build"));

	try {
		await $`bun run sdk:build`;
		log(chalk.green("✅ SDK built successfully"));
	} catch (error) {
		log(chalk.red(`❌ Failed to build SDK: ${String(error)}`));
		process.exit(1);
	}

	// Success!
	log(chalk.green(`\n${"=".repeat(50)}`));
	log(chalk.green("✅ Setup completed successfully!"));
	log(chalk.green("=".repeat(50)));
	log(chalk.bold("\nNext steps:"));
	log(chalk.cyan("  1. Review and update your .env file if needed"));
	log(chalk.cyan("  2. Run 'bun run dev' to start development servers"));
	log(
		chalk.cyan(
			"  3. (Optional) Run 'bun run db:seed <WEBSITE_ID> [DOMAIN] [EVENT_COUNT]' to seed sample data"
		)
	);
	log(chalk.bold("\nHappy coding! 🎉"));
}

main().catch((error) => {
	log(chalk.red(`\n❌ Setup failed: ${String(error)}`));
	process.exit(1);
});
