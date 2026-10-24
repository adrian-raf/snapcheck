/**
 * How the query string takes part in the `EndpointUrl` of a transactional signature.
 * - `exclude`: path only (BRI, PayerMax).
 * - `include-sorted`: path + query sorted by name, then value, encoded per RFC 3986 (BCA).
 */
export type QueryStringMode = 'exclude' | 'include-sorted';

/** Only used to let `URL` parse a relative path; never sent anywhere. */
const PARSE_BASE = 'http://snapcheck.invalid';

/**
 * Returns the `EndpointUrl` component to sign for a relative request URL.
 *
 * @example canonicalEndpointUrl('/v1.0/x?b=2&a=1', 'exclude')        // '/v1.0/x'
 * @example canonicalEndpointUrl('/v1.0/x?b=2&a=1', 'include-sorted') // '/v1.0/x?a=1&b=2'
 */
export function canonicalEndpointUrl(relativeUrl: string, mode: QueryStringMode): string {
  const { pathname, searchParams } = new URL(relativeUrl, PARSE_BASE);
  if (mode === 'exclude') {
    return pathname;
  }

  const query = [...searchParams]
    .sort(([nameA, valueA], [nameB, valueB]) => compare(nameA, nameB) || compare(valueA, valueB))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&');

  return query ? `${pathname}?${query}` : pathname;
}

/** `encodeURIComponent` leaves `!'()*` unencoded; RFC 3986 reserves them. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Code-unit comparison: deterministic and locale-independent, unlike `localeCompare`. */
function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
