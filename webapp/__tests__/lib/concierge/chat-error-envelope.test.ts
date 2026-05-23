// Unit tests for mapChatError — Step 1 of 2026-05-22 Supabase recovery sprint.
// Verifies the chat route's outer try-catch converts every common throw shape
// into a structured envelope the frontend can render cleanly.

import { describe, expect, test } from 'vitest';
import { mapChatError } from '@/lib/concierge/chat-error-envelope';

describe('mapChatError', () => {
  test('maps Supabase exceed_egress_quota by code substring → quota envelope, 503', () => {
    const env = mapChatError({
      code: 'EXCEED_EGRESS_QUOTA',
      message: 'Service for this project is restricted due to the following violations: exceed_egress_quota.',
      status: 402,
    });
    expect(env.ok).toBe(false);
    expect(env.error).toBe('supabase_quota_exceeded');
    expect(env.detail).toMatch(/quota exceeded/i);
    expect(env.status).toBe(503);
  });

  test('maps bare HTTP 402 status (no quota substring) → quota envelope', () => {
    const env = mapChatError({ status: 402, message: 'Payment Required' });
    expect(env.error).toBe('supabase_quota_exceeded');
    expect(env.status).toBe(503);
  });

  test('maps HTTP 503 → supabase_unavailable, 503', () => {
    const env = mapChatError({ status: 503, message: 'Service Unavailable' });
    expect(env.error).toBe('supabase_unavailable');
    expect(env.status).toBe(503);
    expect(env.detail).toContain('Service Unavailable');
  });

  test('maps HTTP 401 → supabase_auth_failed, 502', () => {
    const env = mapChatError({ status: 401, message: 'JWT expired' });
    expect(env.error).toBe('supabase_auth_failed');
    expect(env.status).toBe(502);
  });

  test('maps HTTP 403 → supabase_auth_failed', () => {
    const env = mapChatError({ status: 403, message: 'RLS denied' });
    expect(env.error).toBe('supabase_auth_failed');
  });

  test('maps PostgrestError code (PGRST116) → supabase_request_failed, 502', () => {
    const env = mapChatError({ code: 'PGRST116', message: 'no rows returned' });
    expect(env.error).toBe('supabase_request_failed');
    expect(env.status).toBe(502);
    expect(env.detail).toContain('PGRST116');
  });

  test('maps SQLSTATE 5-char code (23505 unique violation) → supabase_request_failed', () => {
    const env = mapChatError({ code: '23505', message: 'duplicate key' });
    expect(env.error).toBe('supabase_request_failed');
    expect(env.detail).toContain('23505');
  });

  test('maps plain Error → generic chat_failed, 500', () => {
    const env = mapChatError(new Error('boom'));
    expect(env.error).toBe('chat_failed');
    expect(env.status).toBe(500);
    expect(env.detail).toBe('boom');
  });

  test('maps string throw → generic chat_failed', () => {
    const env = mapChatError('something went wrong');
    expect(env.error).toBe('chat_failed');
    expect(env.detail).toBe('something went wrong');
  });

  test('maps undefined / null throw → generic chat_failed, "Unknown error"', () => {
    expect(mapChatError(undefined).detail).toBe('Unknown error');
    expect(mapChatError(null).detail).toBe('Unknown error');
  });

  test('truncates extremely long error messages to 300 chars', () => {
    const longMsg = 'x'.repeat(500);
    const env = mapChatError(new Error(longMsg));
    expect(env.detail.length).toBeLessThanOrEqual(300);
  });

  test('prefers exceed_egress_quota over generic 503 when both present', () => {
    const env = mapChatError({
      status: 503,
      message: 'service restricted: exceed_egress_quota',
    });
    expect(env.error).toBe('supabase_quota_exceeded');
  });
});
