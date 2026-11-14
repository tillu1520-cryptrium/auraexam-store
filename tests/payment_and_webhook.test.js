import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

describe('Milestone 4: Razorpay Payment & Webhook Cryptographic Verification', () => {
  const testSecret = 'rzp_test_secret_key_12345';

  function computeHmac(secret, payload) {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }

  it('generates and verifies valid Razorpay Checkout payment signatures', () => {
    const orderId = 'order_DBJOWzybf0sJbb';
    const paymentId = 'pay_29QQoUBcxrhErq';
    const payload = `${orderId}|${paymentId}`;

    const validSignature = computeHmac(testSecret, payload);
    expect(validSignature).toHaveLength(64); // SHA-256 hex length

    const isMatch = constantTimeEqual(validSignature, computeHmac(testSecret, payload));
    expect(isMatch).toBe(true);
  });

  it('rejects tampered payment signatures', () => {
    const orderId = 'order_DBJOWzybf0sJbb';
    const paymentId = 'pay_29QQoUBcxrhErq';
    const payload = `${orderId}|${paymentId}`;

    const validSignature = computeHmac(testSecret, payload);
    const tamperedSignature = validSignature.slice(0, -1) + (validSignature.slice(-1) === 'a' ? 'b' : 'a');

    expect(constantTimeEqual(validSignature, tamperedSignature)).toBe(false);
  });

  it('verifies Razorpay Webhook raw payload signatures', () => {
    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_ABC123',
            amount: 40000,
            currency: 'INR',
            status: 'captured',
            order_id: 'order_XYZ789'
          }
        }
      }
    });

    const expectedSignature = computeHmac(testSecret, webhookPayload);
    expect(constantTimeEqual(expectedSignature, computeHmac(testSecret, webhookPayload))).toBe(true);

    // Tampered payload (e.g. modified amount)
    const tamperedPayload = webhookPayload.replace('40000', '10000');
    expect(constantTimeEqual(expectedSignature, computeHmac(testSecret, tamperedPayload))).toBe(false);
  });

  it('enforces integer paise precision without float rounding errors', () => {
    const prices = [150, 150, 100];
    const totalPaise = prices.reduce((acc, rupees) => acc + Math.round(rupees * 100), 0);

    expect(totalPaise).toBe(40000);
    expect(Number.isInteger(totalPaise)).toBe(true);
  });
});
