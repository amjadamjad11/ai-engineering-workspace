import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwksResolver: JWTVerifyGetKey | null = null;
  private expectedIssuer: string | null = null;
  private readonly expectedAudience = 'authenticated';

  constructor(private readonly configService: ConfigService) {
    this.initJwksResolver();
  }

  private initJwksResolver(): void {
    const rawUrl = this.configService.get<string>('SUPABASE_URL');
    if (!rawUrl || rawUrl.trim() === '') {
      this.logger.warn('SUPABASE_URL is not configured. JWT authentication will be disabled.');
      return;
    }

    try {
      const normalizedUrl = rawUrl.replace(/\/+$/, '');
      const jwksUrl = new URL(`${normalizedUrl}/auth/v1/.well-known/jwks.json`);
      this.expectedIssuer = `${normalizedUrl}/auth/v1`;

      this.jwksResolver = createRemoteJWKSet(jwksUrl, {
        cacheMaxAge: 10 * 60 * 1000, // 10 minutes
        cooldownDuration: 30 * 1000,  // 30 seconds
      });
    } catch {
      this.logger.error('Failed to parse SUPABASE_URL into a valid JWKS endpoint.');
      this.jwksResolver = null;
    }
  }

  /**
   * Allows injecting a custom JWKS key resolver (e.g. for testing with ephemeral keys).
   */
  public setJwksResolver(resolver: JWTVerifyGetKey, expectedIssuer?: string): void {
    this.jwksResolver = resolver;
    if (expectedIssuer !== undefined) {
      this.expectedIssuer = expectedIssuer;
    }
  }

  /**
   * Verifies an asymmetric ES256 Supabase JWT and returns a sanitized AuthenticatedUser.
   */
  async verifyToken(token: string): Promise<AuthenticatedUser> {
    if (!this.jwksResolver || !this.expectedIssuer) {
      this.logger.error('Authentication attempt while SUPABASE_URL or JWKS resolver is not configured.');
      throw new InternalServerErrorException('Authentication service is misconfigured.');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwksResolver, {
        algorithms: ['ES256'],
        issuer: this.expectedIssuer,
        audience: this.expectedAudience,
      });

      const sub = payload.sub;
      if (!sub || typeof sub !== 'string' || !UUID_V4_REGEX.test(sub)) {
        throw new UnauthorizedException('Invalid subject claim in token.');
      }

      const email = typeof payload.email === 'string' ? payload.email : undefined;
      const role = typeof payload.role === 'string' ? payload.role : undefined;

      const appMetadata =
        payload.app_metadata && typeof payload.app_metadata === 'object' && !Array.isArray(payload.app_metadata)
          ? Object.freeze({ ...(payload.app_metadata as Record<string, unknown>) })
          : Object.freeze({});

      const userMetadata =
        payload.user_metadata && typeof payload.user_metadata === 'object' && !Array.isArray(payload.user_metadata)
          ? Object.freeze({ ...(payload.user_metadata as Record<string, unknown>) })
          : Object.freeze({});

      return {
        id: sub,
        email,
        role,
        appMetadata,
        userMetadata,
      };
    } catch (error: any) {
      // If error is already our custom UnauthorizedException (e.g. invalid sub UUID), re-throw
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Check for network/infrastructure failures when fetching JWKS
      const isNetworkOrJwksError =
        error?.code === 'ERR_JWKS_FETCH_FAILED' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ETIMEDOUT' ||
        error?.name === 'FetchError' ||
        error?.cause?.code === 'ERR_JWKS_FETCH_FAILED' ||
        error?.cause?.name === 'FetchError' ||
        (typeof error?.message === 'string' &&
          (error.message.toLowerCase().includes('fetch failed') ||
           error.message.toLowerCase().includes('jwks')));

      if (isNetworkOrJwksError) {
        this.logger.error('JWKS retrieval failed due to network or upstream service error.');
        throw new ServiceUnavailableException('Authentication service is temporarily unavailable.');
      }

      // Distinguish standard JWT validation errors (all become 401)
      // e.g. ERR_JWT_EXPIRED, ERR_JWT_CLAIM_VALIDATION_FAILED, ERR_JWS_SIGNATURE_VERIFICATION_FAILED, ERR_JOSE_ALG_NOT_ALLOWED
      throw new UnauthorizedException('Invalid or expired authentication credentials.');
    }
  }
}
