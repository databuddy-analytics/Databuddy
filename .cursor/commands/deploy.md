## Deploy tracker scripts to Bunny.net CDN

Deploys the Databuddy tracker scripts from `packages/tracker/dist/` to Bunny.net Storage.

### Before Deploying

1. Ensure environment variables are set:
   - `BUNNY_STORAGE_ZONE_NAME`
   - `BUNNY_STORAGE_ACCESS_KEY`
   - `BUNNY_API_KEY` (optional, for cache purging)
   - `BUNNY_PULL_ZONE_ID` (optional, for cache purging)
   - `BUNNY_STORAGE_REGION` (optional)
   - `DISCORD_WEBHOOK_URL` (optional, for notifications)

2. Verify the project builds successfully: `cd packages/tracker && bun run build`

3. Check that tests pass: `cd packages/tracker && bun run test:e2e`

### Deployment Process

The deployment script (`packages/tracker/deploy.ts`) performs:

1. **Build** (unless `--skip-build`): Runs `bun run build` in `packages/tracker/`
2. **Test** (unless `--skip-tests` or `--dry-run`): Runs `bun run test:e2e`
3. **Check Changes**: Compares local file hashes with remote CDN files
4. **Upload**: Uploads only changed/new files to Bunny.net Storage
5. **Purge Cache**: Purges Pull Zone cache (if API key provided)
6. **Notify**: Sends Discord notification (if webhook configured)

### Usage

```bash
cd packages/tracker
bun run deploy.ts [options]
```

### Options

- `-d, --dry-run`: Simulate deployment without uploading
- `-y, --yes`: Skip confirmation prompt
- `-f, --force`: Force upload even if hash matches
- `-m, --message <text>`: Add note to Discord notification
- `-s, --skip-notification`: Skip Discord notification
- `-t, --skip-tests`: Skip E2E tests before deployment
- `-b, --skip-build`: Skip building before deployment
- `-p, --purge`: Only purge cache, skip deployment
- `-v, --verbose`: Enable verbose logging

### Examples

```bash
# Standard deployment with confirmation
bun run deploy.ts

# Dry run to see what would be deployed
bun run deploy.ts --dry-run

# Deploy without confirmation
bun run deploy.ts --yes

# Deploy with custom message
bun run deploy.ts --message "Fix tracking bug"

# Skip tests and build (if already done)
bun run deploy.ts --skip-tests --skip-build

# Force upload all files
bun run deploy.ts --force

# Only purge cache
bun run deploy.ts --purge
```

### Rules

- Always run from `packages/tracker/` directory
- Never skip tests unless explicitly requested or in dry-run mode
- Files are only uploaded if they've changed (hash comparison)
- Deployment automatically purges CDN cache after successful upload
- Discord notifications are sent unless `--skip-notification` is used
