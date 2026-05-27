import { vi } from 'vitest';

// Silence console.error/warn in tests unless explicitly needed
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Set required env vars for tests that check config flags
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-for-tests';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-at-least-32-chars-long';
process.env.ENCRYPTION_KEY = '0'.repeat(64); // 32 bytes as hex
process.env.NODE_ENV = 'test';
