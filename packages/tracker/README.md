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
To deploy the built artifacts to Bunny.net (Production CDN):
```bash
bun run release
```
*Requires `BUNNY_STORAGE_ZONE_NAME` and `BUNNY_STORAGE_ACCESS_KEY` environment variables.*

## Project Structure

- **`src/core/`**: The backbone of the tracker (`BaseTracker`, `HttpClient`, `utils`).
- **`src/plugins/`**: Modular feature extensions (Web Vitals, Errors, etc.).
- **`src/index.ts`**: The main entry point that assembles the `databuddy.js` bundle.
- **`build.ts`**: Bun build script configuration.
- **`deploy.ts`**: Internal CLI for handling Bunny.net uploads.
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
