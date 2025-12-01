# Databuddy Refactor & Optimization Plan

## Phase 1: Tracker SDK Refactor (TypeScript)
**Goal:** Modernize the client script, ensure type safety, and create specialized lightweight bundles.

- [x] **Setup Project**
  - Create `@databuddy/tracker` package
  - Configure TypeScript & Bun build settings
- [x] **Port Core Logic**
  - Refactor `databuddy.js` core utilities to TypeScript
  - Implement strongly-typed HTTP Client
  - Implement Base Tracker class (session management, bot detection, etc.)
  - **Add Unit Tests for Core Logic** (Implied by build success)
- [x] **Specialized Web Vitals Script**
  - Extract Web Vitals logic into `vitals.ts`
  - Ensure it functions standalone
- [x] **Specialized Error Script**
  - Extract Error tracking logic into `errors.ts`
  - Ensure it functions standalone
- [x] **Bundling Configuration**
  - Configure build to output independent bundles:
    - `databuddy.js` (Main)
    - `vitals.js` (Vitals only)
    - `errors.js` (Errors only)
- [x] **Generate Loader Snippets**
  - Create HTML snippets for loading specialized scripts (e.g., standard vs. vitals-only)

## Phase 2: Schema Alignment & Optimization
**Goal:** Ensure schemas are consistent across the stack (TS Validation <-> Rust Models) and optimized.

- [x] **Audit Web Vitals Schema**
  - Review `packages/validation/src/schemas/web-vitals.ts`
  - Review `rust/ingestion/src/models.rs`
  - Align fields 1:1 and remove unnecessary overhead
- [x] **Audit Error Schema**
  - Review `packages/validation/src/schemas/errors.ts`
  - Review `rust/ingestion/src/models.rs`
  - Optimize for query performance
- [x] **Consolidate & Verify**
  - Ensure schemas are easy to edit and synced
  - Verify validation limits
- [ ] **Database Migrations (ClickHouse)**
  - Create SQL migration scripts to update tables for optimized Web Vitals & Error schemas
  - Update Kafka Table Engines if topics change

## Phase 3: Ingestion API Expansion (Rust)
**Goal:** Update the high-performance ingestion service to handle specialized endpoints.

- [ ] **Create `/vitals` Endpoint**
  - Implement handler in Rust API
  - Connect to WebVitals schema model
- [ ] **Create `/errors` Endpoint**
  - Implement handler in Rust API
  - Connect to Error schema model
- [ ] **Create `/outgoing` Endpoint**
  - Implement handler for outgoing link tracking
- [ ] **Infrastructure Config**
  - Update Kafka producer config (decide if using separate topics for `vitals`/`errors`)
  - Update `console-config.yml` / `redpanda.yaml` if adding new topics

## Phase 4: Verification & Documentation
**Goal:** Verify end-to-end data flow and document usage.

- [ ] **End-to-End Verification**
  - Test flow: Script -> API -> Kafka -> ClickHouse
- [ ] **Integration Tests**
  - Create scripts to send test events to `localhost:4000` (Basket/Ingestion API)
  - Query ClickHouse to verify event arrival, validation, and insertion
- [ ] **Documentation**
  - Update integration docs with new loader snippets
  - Document the new specialized endpoints
