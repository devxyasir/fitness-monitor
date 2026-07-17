/**
 * @replaycoach/types — single source of truth for API contracts.
 */
export * from './auth';
export * from './user';
export * from './organization';
export * from './session';
export * from './replay';
export * from './pose';
export * from './annotation-tracking';
export * from './system-settings';

// ── Legacy / scalar type aliases ─────────────────────────────────────────────
export type { HealthResponse } from './health';
export type { UserId, SessionId, OrganizationId } from './scalars';
