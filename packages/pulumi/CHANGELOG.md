# @databuddy/pulumi

## 0.1.1

### Patch Changes

- Never retry timed-out requests, keep dashboard values for fields in `ignoreChanges` even without a refresh, reject invalid monitor URLs at preview, create a replacement monitor first whenever the old one doesn't block it, and require Pulumi 3.216 or newer.
