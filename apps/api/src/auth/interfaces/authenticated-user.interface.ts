export interface AuthenticatedUser {
  readonly id: string;
  readonly email?: string;
  readonly role?: string;
  readonly appMetadata: Readonly<Record<string, unknown>>;
  readonly userMetadata: Readonly<Record<string, unknown>>;
}
