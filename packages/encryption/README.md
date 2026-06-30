# @databuddy/encryption

Small server-side helpers for encrypted integration secrets.

```ts
import { compare, decrypt, encrypt, generateKey } from "@databuddy/encryption";

const masterKey = process.env.DATABUDDY_ENCRYPTION_KEY;
const ciphertext = encrypt("secret-value", masterKey);
const plaintext = decrypt(ciphertext, masterKey);

const matches = compare(plaintext, "secret-value");
const newMasterKey = generateKey();
```

The encrypted payload format is versioned. Keep `DATABUDDY_ENCRYPTION_KEY`
high entropy and stable; rotating it requires re-encrypting stored payloads.
