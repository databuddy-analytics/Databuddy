# @databuddy/sdk

## 2.6.1-beta.0

### Patch Changes

- 5bdf92c: `getAnonymousId` and `getSessionId` now return `null` instead of throwing when `localStorage` or `sessionStorage` access raises a `DOMException`. Follows the same try/catch pattern already used by `getProfileId`. URL params continue to take priority without touching storage.
