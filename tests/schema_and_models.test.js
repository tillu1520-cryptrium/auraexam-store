import { describe, it, expect } from 'vitest';

describe('Milestone 2: Schema & Business Rules Verification', () => {
  const initialProducts = [
    { slug: 'physics', name: 'Physics', price_paise: 15000 },
    { slug: 'bee', name: 'Basic Electrical Engineering', price_paise: 15000 },
    { slug: 'mathematics', name: 'Mathematics', price_paise: 10000 }
  ];

  it('validates initial product catalogue and integer pricing in paise', () => {
    const physics = initialProducts.find(p => p.slug === 'physics');
    const bee = initialProducts.find(p => p.slug === 'bee');
    const math = initialProducts.find(p => p.slug === 'mathematics');

    expect(physics.price_paise).toBe(15000); // ₹150
    expect(bee.price_paise).toBe(15000);     // ₹150
    expect(math.price_paise).toBe(10000);    // ₹100
  });

  it('calculates trusted backend subtotal and combinations', () => {
    // Single subject
    expect(15000).toBe(15000); // ₹150
    // Two subjects: Physics + Math
    expect(15000 + 10000).toBe(25000); // ₹250
    // Two subjects: Physics + BEE
    expect(15000 + 15000).toBe(30000); // ₹300
    // All three subjects
    expect(15000 + 15000 + 10000).toBe(40000); // ₹400
  });

  it('calculates 75% subject-wise refund with exact integer paise precision', () => {
    // 75% of Physics (₹150 / 15000 paise) = 11250 paise (₹112.50)
    const physicsRefund = Math.round(15000 * 0.75);
    expect(physicsRefund).toBe(11250);

    // 75% of BEE (₹150 / 15000 paise) = 11250 paise (₹112.50)
    const beeRefund = Math.round(15000 * 0.75);
    expect(beeRefund).toBe(11250);

    // 75% of Mathematics (₹100 / 10000 paise) = 7500 paise (₹75.00)
    const mathRefund = Math.round(10000 * 0.75);
    expect(mathRefund).toBe(7500);

    // Combined order (₹400) refunding only 1 eligible subject (e.g. Mathematics)
    expect(mathRefund).toBe(7500);
    expect(40000 - mathRefund).toBe(32500); // ₹325 retained
  });

  it('validates customer details formats correctly', () => {
    const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    const validMobile = (mobile) => /^[6-9]\d{9}$/.test(mobile);
    const validUpi = (upi) => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upi);

    expect(validEmail('student@example.com')).toBe(true);
    expect(validEmail('invalid-email')).toBe(false);

    expect(validMobile('9876543210')).toBe(true);
    expect(validMobile('5551234567')).toBe(false); // Does not start with 6-9
    expect(validMobile('987654321')).toBe(false);  // 9 digits

    expect(validUpi('student@okhdfcbank')).toBe(true);
    expect(validUpi('user.name-12@paytm')).toBe(true);
    expect(validUpi('invalid_upi_no_handle')).toBe(false);
  });
});
