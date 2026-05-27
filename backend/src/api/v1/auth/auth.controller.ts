import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from './auth.service';
import { ok, created, badRequest, unauthorized } from '../../../lib/response';

const registerManagerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  companyName: z.string().min(1),
  companyEmail: z.string().email(),
  companyPhone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerManager(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = registerManagerSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.errors.map((e) => e.message).join(', '));
      return;
    }

    const tokens = await authService.registerManager(parsed.data);
    created(res, tokens);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'EMAIL_TAKEN') {
      badRequest(res, 'An account with this email already exists');
      return;
    }
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, 'Invalid email or password');
      return;
    }

    const tokens = await authService.login(parsed.data);
    ok(res, tokens);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      unauthorized(res, 'Invalid email or password');
      return;
    }
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string') {
      badRequest(res, 'refreshToken is required');
      return;
    }

    const tokens = await authService.refresh(refreshToken);
    ok(res, tokens);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_TOKEN') {
      unauthorized(res, 'Invalid or expired refresh token');
      return;
    }
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (refreshToken && typeof refreshToken === 'string') {
      await authService.logout(refreshToken);
    }
    ok(res, { message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  ok(res, req.user);
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      badRequest(res, 'email is required');
      return;
    }
    await authService.forgotPassword(email);
    // Always 200 — don't reveal if email exists
    ok(res, { message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({ token: z.string().min(1), password: z.string().min(8) }).safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.errors.map((e) => e.message).join(', '));
      return;
    }
    await authService.resetPassword(parsed.data.token, parsed.data.password);
    ok(res, { message: 'Password reset successfully' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_TOKEN') {
      badRequest(res, 'Reset link is invalid or has expired');
      return;
    }
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }).safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.errors.map((e) => e.message).join(', '));
      return;
    }
    await authService.changePassword(req.user!.sub, parsed.data.currentPassword, parsed.data.newPassword);
    ok(res, { message: 'Password changed successfully' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      badRequest(res, 'Current password is incorrect');
      return;
    }
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = z.object({
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      phone: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.errors.map((e) => e.message).join(', '));
      return;
    }
    const user = await authService.updateProfile(req.user!.sub, parsed.data);
    ok(res, user);
  } catch (err) {
    next(err);
  }
}
