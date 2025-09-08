import { Injectable } from '@nestjs/common';
import { CookieOptions } from 'express';

@Injectable()
export class CookieConfigService {
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly domain = this.isProduction ? '.bancongnghe.tech' : undefined; // No domain for localhost

  /**
   * Get default cookie options for JWT token
   */
  getTokenCookieOptions(): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true, // Prevent XSS attacks
      secure: this.isProduction, // HTTPS only in production
      sameSite: 'strict', // CSRF protection
      maxAge: 6 * 60 * 60 * 1000, // 6 hours in milliseconds
      path: '/', // Available for entire site
    };

    // Only set domain in production
    if (this.domain) {
      options.domain = this.domain;
    }

    return options;
  }

  /**
   * Get cookie options for clearing cookies
   */
  getClearCookieOptions(): CookieOptions {
    const options: CookieOptions = {
      path: '/',
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
    };

    // Only set domain in production
    if (this.domain) {
      options.domain = this.domain;
    }

    return options;
  }

  /**
   * Get cookie options for session cookies (shorter duration)
   */
  getSessionCookieOptions(): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000, // 30 minutes
      path: '/',
    };

    if (this.domain) {
      options.domain = this.domain;
    }

    return options;
  }

  /**
   * Get cookie options for remember me functionality (longer duration)
   */
  getRememberMeCookieOptions(): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    };

    if (this.domain) {
      options.domain = this.domain;
    }

    return options;
  }

  /**
   * Get the configured domain
   */
  getDomain(): string | undefined {
    return this.domain;
  }

  /**
   * Check if running in production
   */
  isProductionEnvironment(): boolean {
    return this.isProduction;
  }
}
