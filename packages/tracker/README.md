# Tracker Script Package

Internal monorepo package for building, testing, and deploying the core analytics tracker script (`databuddy.js`).

**⚠️ Internal Use Only**: This package is not published to NPM for public consumption. It generates the static assets served via our CDN.

## Workflows

### 1. Development
Run the build in watch mode while developing:
```bash
bun run dev
```

### 2. Comparison
Before deploying, verify how your local changes compare to the live production script:
```bash
bun run diff
```
This fetches the current script from `https://databuddy.b-cdn.net`, compares hashes, and highlights differences.

### 3. Deployment
Merging tracker changes to `main` deploys them. The `Deploy Tracker` job in `.github/workflows/sdk-e2e.yml` builds, runs the Playwright suite, attests build provenance, and uploads to Bunny.net from the `tracker-cdn` environment. Run it by hand from the Actions tab (`dry_run` reports changes without uploading, `force` re-uploads every file).

Unversioned scripts (`databuddy.js`) are cached for 5 minutes at the edge and 1 hour in browsers, so a deploy reaches every visitor within about an hour with no cache purge. Versioned scripts (`databuddy.v8.js`) are immutable. To roll back, revert the change on `main`.

Verify a CDN file was built from this repo:
```bash
curl -sO https://cdn.databuddy.cc/databuddy.js && gh attestation verify databuddy.js -R databuddy-analytics/Databuddy
```

## Project Structure

- **`src/core/`**: The backbone of the tracker (`BaseTracker`, `HttpClient`, `utils`).
- **`src/plugins/`**: Modular feature extensions (Web Vitals, Errors, etc.).
- **`src/index.ts`**: The main entry point that assembles the `databuddy.js` bundle.
- **`build.ts`**: Bun build script configuration.
- **`deploy.ts`**: Uploads `dist/` to Bunny.net and records versions; runs in CI only.
- **`compare-release.ts`**: Internal tool for auditing local vs. remote scripts.

## Adding New Features

### Plugin Architecture
We use a plugin-based architecture to keep the core lightweight.

1. **Create Plugin**: Add a new file in `src/plugins/` (e.g., `my-feature.ts`).
2. **Implement Logic**: Export an init function receiving `BaseTracker`.
   ```typescript
   export function initMyFeature(tracker: BaseTracker) {
       if (tracker.isServer()) return;
       // ... add event listeners
   }
   ```
3. **Register**: Import and call it in `src/index.ts` based on configuration flags.

## Testing

- **Local Server**: `bun run serve` spins up a test page at `http://localhost:3000` to manually verify tracking.
- **E2E Tests**: `bun run test:e2e` runs Playwright suites.
