import { describe, expect, it } from 'vitest';
import { toastForEvent } from '@/lib/websocket/toast-events';

describe('toastForEvent (#149)', () => {
  it('shows a success toast when a payment is received', () => {
    expect(toastForEvent('payment:completed', {})).toEqual({
      type: 'success',
      message: 'Payment received',
    });
  });

  it('includes the amount and currency when the payload has them', () => {
    expect(
      toastForEvent('payment:completed', { amount: 1200, currency: 'USDC' }),
    ).toEqual({ type: 'success', message: 'Payment received: 1200 USDC' });
  });

  it.each(['OPEN', 'opened', 'Created', 'FILED'])(
    'shows a warning when a dispute is opened (%s)',
    (status) => {
      expect(toastForEvent('dispute:status', { status })).toEqual({
        type: 'warning',
        message: 'A dispute was opened',
      });
    },
  );

  it('distinguishes resolved and other dispute updates', () => {
    expect(toastForEvent('dispute:status', { status: 'RESOLVED' })?.type).toBe(
      'success',
    );
    expect(
      toastForEvent('dispute:status', { status: 'UNDER_REVIEW' })?.type,
    ).toBe('info');
    expect(toastForEvent('dispute:status', undefined)?.type).toBe('info');
  });

  it('maps escrow and appeal events', () => {
    expect(toastForEvent('escrow:released', {})?.type).toBe('success');
    expect(toastForEvent('appeal:submitted', {})?.type).toBe('info');
  });

  it('shows nothing for chatty or unknown events', () => {
    expect(toastForEvent('vote:cast', {})).toBeNull();
    expect(toastForEvent('something:else', {})).toBeNull();
  });

  it('never puts raw server text into the message', () => {
    const spec = toastForEvent('dispute:status', {
      status: 'OPEN',
      message: '<script>alert(1)</script>',
    });
    expect(spec?.message).toBe('A dispute was opened');
  });

  it('cleans and truncates payment details from the server', () => {
    const spec = toastForEvent('payment:completed', {
      amount: `5\n0${'0'.repeat(100)}`,
      currency: 'US\u0000D',
    });
    expect(spec?.message).not.toMatch(/[\n\u0000]/);
    expect(spec?.message.length).toBeLessThan(120);
  });

  it('survives non-object payloads', () => {
    expect(() => toastForEvent('payment:completed', null)).not.toThrow();
    expect(() => toastForEvent('payment:completed', 'text')).not.toThrow();
  });
});
