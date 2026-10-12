import { base32Decode, base32Encode, hotp } from './two-factor.service';

describe('TOTP helpers', () => {
  // RFC 6238 appendix B: SHA-1 key "12345678901234567890"; 6-digit codes are the last 6 of the 8-digit vectors.
  const key = Buffer.from('12345678901234567890');
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC 6238 vector at t=%i', (time, code) => {
    expect(hotp(key, Math.floor(time / 30))).toBe(code);
  });

  it('round-trips base32 like authenticator apps expect', () => {
    expect(base32Encode(key)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(key)).toBe(true);
  });
});
