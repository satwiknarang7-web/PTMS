/** A user signed in to an organization (tenant). All tenant routes receive this shape. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  firstName: string;
  lastName: string;
}
export const AuthenticatedUser = {};

/** The platform root account; it is not part of any organization. */
export interface PlatformUser extends Omit<AuthenticatedUser, 'organizationId'> {
  organizationId: null;
}
export const PlatformUser = {};

/** Whoever is signed in. AccountScopeGuard narrows it to the right shape per route. */
export type Principal = AuthenticatedUser | PlatformUser;
export const Principal = {};

export interface JwtAccessPayload {
  sub: string;
  org: string | null;
  role: string;
}
export const JwtAccessPayload = {};

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
}
export const JwtRefreshPayload = {};
