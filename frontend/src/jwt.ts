// Shared client-side JWT helpers. The token payload carries the user's identity
// (name, email) and expiry, so we decode it locally rather than calling a "me" endpoint.

export const TOKEN_KEY = 'presenter_token';

export function decodeJwtPayload(token: string): { name?: string; email?: string; exp?: number } {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      name?: string;
      email?: string;
      exp?: number;
    };
  } catch {
    return {};
  }
}

export function decodeJwtName(token: string): string {
  const payload = decodeJwtPayload(token);
  return typeof payload.name === 'string' ? payload.name : 'Guest';
}

export function decodeJwtEmail(token: string): string {
  const payload = decodeJwtPayload(token);
  return typeof payload.email === 'string' ? payload.email : '';
}

export function isJwtExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp;
}
