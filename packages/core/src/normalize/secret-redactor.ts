// it.ktrdiff.core.normalize.SecretRedactor — central redaction of secrets. Every renderer and
// change builder passes candidate values through here; secret values never reach any output.

export const REDACTED = '[REDACTED]';

/** True when an element/property name holds a secret. */
export function isSecretProperty(propertyName: string | null | undefined): boolean {
  if (propertyName === null || propertyName === undefined) return false;
  // Java uses toLowerCase(Locale.ROOT); JS toLowerCase is locale-independent too.
  const p = propertyName.toLowerCase();
  return p === 'password'
    || p.endsWith('_password')
    || p.endsWith('password') // proxyPassword, sasPassword, EXTRA_OPTION_*.password...
    || p.includes('passphrase')
    || p === 'secretkey'
    || p === 'secret_key'
    || p === 'token' || p.endsWith('_token')
    || p === 'apikey' || p === 'api_key';
}

/**
 * Value to expose for the given property. Non-secret values pass through unchanged; any
 * non-null secret becomes REDACTED (an empty password too, so it stays indistinguishable, and
 * Pentaho "Encrypted ..." payloads, which are still secrets).
 */
export function redact<T>(propertyName: string | null | undefined, value: T): T | typeof REDACTED {
  if (!isSecretProperty(propertyName)) return value;
  if (value === null || value === undefined) return value;
  return REDACTED;
}
