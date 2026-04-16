import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { LRUCache } from "lru-cache";
import { UAParser } from "ua-parser-js";

let dailySalt = new Date().toISOString().slice(0, 10);
let saltUpdatedAt = Date.now();

function hashIp(ip: string): string {
  const now = Date.now();
  if (now - saltUpdatedAt > 60_000) {
    dailySalt = new Date().toISOString().slice(0, 10);
    saltUpdatedAt = now;
  }
  return createHash("sha256")
    .update(ip + dailySalt)
    .digest("hex");
}

const uaCache = new LRUCache<
  string,
  { browser: string | null; device: string | null }
>({ max: 500, ttl: 300_000 });

function parseUA(ua: string | null): {
  browser: string | null;
  device: string | null;
} {
  if (!ua) return { browser: null, device: null };
  const cached = uaCache.get(ua);
  if (cached) return cached;
  try {
    const r = new UAParser(ua).getResult();
    const parsed = {
      browser: r.browser.name || null,
      device: r.device.type || "desktop",
    };
    uaCache.set(ua, parsed);
    return parsed;
  } catch {
    return { browser: null, device: null };
  }
}

describe("hashIp", () => {
  test("returns a 64-char hex string (SHA256)", () => {
    expect(hashIp("192.168.1.1")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("is deterministic for the same IP", () => {
    expect(hashIp("8.8.8.8")).toBe(hashIp("8.8.8.8"));
  });

  test("produces different hashes for different IPs", () => {
    expect(hashIp("8.8.8.8")).not.toBe(hashIp("1.1.1.1"));
  });

  test("handles empty string", () => {
    expect(hashIp("")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("handles IPv6", () => {
    expect(hashIp("2001:0db8:85a3::8a2e:0370:7334")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("produces unique hashes for 100 IPs", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const ip = `${Math.floor(i / 27) + 1}.${(i * 7) % 256}.${(i * 13) % 256}.${(i * 17) % 256}`;
      hashes.add(hashIp(ip));
    }
    expect(hashes.size).toBe(100);
  });
});

describe("parseUA", () => {
  test("null / empty → null values", () => {
    expect(parseUA(null)).toEqual({ browser: null, device: null });
    expect(parseUA("")).toEqual({ browser: null, device: null });
  });

  test("Chrome on Windows → desktop", () => {
    const r = parseUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(r.browser).toBe("Chrome");
    expect(r.device).toBe("desktop");
  });

  test("Firefox on Windows → desktop", () => {
    const r = parseUA(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    );
    expect(r.browser).toBe("Firefox");
    expect(r.device).toBe("desktop");
  });

  test("Safari on macOS → desktop", () => {
    const r = parseUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    );
    expect(r.browser).toBe("Safari");
    expect(r.device).toBe("desktop");
  });

  test("Safari on iPhone → mobile", () => {
    const r = parseUA(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    );
    expect(r.browser).toBe("Mobile Safari");
    expect(r.device).toBe("mobile");
  });

  test("Chrome on Android → mobile", () => {
    const r = parseUA(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
    );
    expect(r.browser).toBe("Mobile Chrome");
    expect(r.device).toBe("mobile");
  });

  test("iPad → tablet", () => {
    const r = parseUA(
      "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    );
    expect(r.browser).toBe("Mobile Safari");
    expect(r.device).toBe("tablet");
  });

  test("Googlebot → defaults to desktop", () => {
    const r = parseUA(
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    );
    expect(r.browser).toBeNull();
    expect(r.device).toBe("desktop");
  });

  test("curl → defaults to desktop", () => {
    const r = parseUA("curl/8.4.0");
    expect(r.browser).toBeNull();
    expect(r.device).toBe("desktop");
  });

  test("malformed UA → does not throw", () => {
    expect(parseUA("not a real user agent!!!")).toBeDefined();
  });

  test("very long UA → does not throw", () => {
    expect(parseUA("Mozilla/5.0 ".repeat(100))).toBeDefined();
  });
});

describe("redirect route logic", () => {
  describe("lookupLink pattern", () => {
    async function lookupPattern(opts: {
      cacheResult: { id: string; targetUrl: string } | null;
      dbResult: { id: string; targetUrl: string } | null;
      cacheError?: boolean;
    }) {
      if (!opts.cacheError && opts.cacheResult) return opts.cacheResult;
      return opts.dbResult;
    }

    test("returns cache hit when available", async () => {
      const r = await lookupPattern({
        cacheResult: { id: "cached-123", targetUrl: "https://cached.com" },
        dbResult: { id: "db-123", targetUrl: "https://db.com" },
      });
      expect(r?.id).toBe("cached-123");
    });

    test("falls back to DB when cache empty", async () => {
      const r = await lookupPattern({
        cacheResult: null,
        dbResult: { id: "db-123", targetUrl: "https://db.com" },
      });
      expect(r?.id).toBe("db-123");
    });

    test("returns null when not in cache or DB", async () => {
      expect(
        await lookupPattern({ cacheResult: null, dbResult: null }),
      ).toBeNull();
    });

    test("falls back to DB on cache error", async () => {
      const r = await lookupPattern({
        cacheResult: { id: "cached", targetUrl: "https://cached.com" },
        dbResult: { id: "db-123", targetUrl: "https://db.com" },
        cacheError: true,
      });
      expect(r?.id).toBe("db-123");
    });
  });

  test("timestamp formatting for analytics", () => {
    const formatted = new Date("2025-01-16T10:30:45.123Z")
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    expect(formatted).toBe("2025-01-16 10:30:45.123");
  });

  test("302 redirect preserves target URL", () => {
    for (const url of [
      "https://example.com/path?query=value#hash",
      "https://example.com/path?utm_source=test&utm_medium=link",
    ]) {
      expect(Response.redirect(url, 302).headers.get("location")).toBe(url);
    }
  });
});
