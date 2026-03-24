export const LINKS_BASE_URL = "dby.sh" as const;
export const LINKS_FULL_URL = `https://${LINKS_BASE_URL}` as const;
export const SLUG_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DOMAIN_REGEX = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i;
