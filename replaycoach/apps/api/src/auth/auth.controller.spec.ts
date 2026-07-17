import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { TokenResponse } from '@replaycoach/types';

// Mock AuthService
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'app.env') return 'test';
    if (key === 'jwt.refreshExpiry') return '7d';
    return null;
  }),
};

// Custom host mock for ThrottlerGuard
const mockThrottlerGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue(mockThrottlerGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  const mockResponse = () => {
    const res: Partial<Response> = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  const mockRequest = (refreshCookieVal?: string) => {
    return {
      cookies: refreshCookieVal ? { rc_refresh: refreshCookieVal } : {},
    } as unknown as Request;
  };

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register user, set refresh cookie, and return access token', async () => {
      const res = mockResponse();
      const tokenReponse: TokenResponse = { accessToken: 'access-123' };
      mockAuthService.register.mockResolvedValue({
        tokenResponse: tokenReponse,
        refreshToken: 'refresh-123',
      });

      const dto = {
        email: 'register@test.com',
        password: 'Password1!',
        displayName: 'Reg User',
        role: 'coach' as const,
      };

      const result = await controller.register(dto, res);

      expect(result).toEqual(tokenReponse);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith('rc_refresh', 'refresh-123', expect.any(Object));
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should authenticate user, set refresh cookie, and return access token', async () => {
      const res = mockResponse();
      const tokenReponse: TokenResponse = { accessToken: 'access-567' };
      mockAuthService.login.mockResolvedValue({
        tokenResponse: tokenReponse,
        refreshToken: 'refresh-567',
      });

      const dto = { email: 'login@test.com', password: 'Password1!' };
      const req = mockRequest();
      const result = await controller.login(dto, req, res);

      expect(result).toEqual(tokenReponse);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto, req.ip);
      expect(res.cookie).toHaveBeenCalledWith('rc_refresh', 'refresh-567', expect.any(Object));
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should rotate token pair using cookie refresh token', async () => {
      const res = mockResponse();
      const req = mockRequest('old-refresh-token');
      const tokenReponse: TokenResponse = { accessToken: 'access-new' };

      mockAuthService.refresh.mockResolvedValue({
        tokenResponse: tokenReponse,
        refreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh(req, res);

      expect(result).toEqual(tokenReponse);
      expect(mockAuthService.refresh).toHaveBeenCalledWith('old-refresh-token');
      expect(res.cookie).toHaveBeenCalledWith('rc_refresh', 'new-refresh-token', expect.any(Object));
    });

    it('should call refresh with empty string if cookie not present', async () => {
      const res = mockResponse();
      const req = mockRequest(); // no cookies
      mockAuthService.refresh.mockResolvedValue({
        tokenResponse: { accessToken: '' },
        refreshToken: '',
      });

      await controller.refresh(req, res);
      expect(mockAuthService.refresh).toHaveBeenCalledWith('');
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should clear refresh cookie and revoke token', async () => {
      const res = mockResponse();
      const req = mockRequest('active-refresh-token');

      await controller.logout(req, res, {
        sub: 'user-id',
        email: 'test@test.com',
        role: 'coach',
        orgId: null,
        sessionVersion: 1,
      });

      expect(mockAuthService.logout).toHaveBeenCalledWith('active-refresh-token', 'user-id');
      expect(res.clearCookie).toHaveBeenCalledWith('rc_refresh', expect.any(Object));
    });
  });

  // ── forgot password ────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should resolve stub successfully', async () => {
      mockAuthService.forgotPassword.mockResolvedValue(undefined);
      const result = await controller.forgotPassword({ email: 'ghost@test.com' });
      expect(result.message).toContain('reset link has been sent');
    });
  });

  // ── reset password ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should resolve stub successfully', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);
      const result = await controller.resetPassword({ token: 'tok', newPassword: 'NewPassword1!' });
      expect(result.message).toContain('Password updated');
    });
  });
});
