// Bun resolves a separate evlog copy for this package (its zod peer differs
// from the catalog), so a host must configure evlog through this export for
// auth's audit events to reach its drain. Remove once zod is aligned.
export { initLogger } from "evlog";
