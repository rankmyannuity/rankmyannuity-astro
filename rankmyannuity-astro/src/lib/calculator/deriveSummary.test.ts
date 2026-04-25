// Tests for the deriveSummary helper.
//
// Asserts exact numeric equality for the three summary values on all
// six parity fixtures, plus edge cases for zero-premium and negative
// nominal return.

import { describe, expect, it } from 'vitest';
import { deriveSummary } from './deriveSummary';
import type { IncomeCalcInputs } from './types';

interface SummaryFixture {
  id: string;
  inputs: IncomeCalcInputs;
  totalPayout: number;
  nominalReturn: number;
  simplePayoutRatio: number; // percent, raw (unrounded)
}

const summaryFixtures: SummaryFixture[] = [
  { id: 'F1', inputs: { premium: 100000, deferralYears: 10, monthlyPayout: 1250,  payoutYears: 13 }, totalPayout: 195000,  nominalReturn: 95000,   simplePayoutRatio: 195  },
  { id: 'F2', inputs: { premium: 100000, deferralYears: 10, monthlyPayout: 1250,  payoutYears: 25 }, totalPayout: 375000,  nominalReturn: 275000,  simplePayoutRatio: 375  },
  { id: 'F3', inputs: { premium: 50000,  deferralYears: 5,  monthlyPayout: 1250,  payoutYears: 5  }, totalPayout: 75000,   nominalReturn: 25000,   simplePayoutRatio: 150  },
  { id: 'F4', inputs: { premium: 50000,  deferralYears: 5,  monthlyPayout: 1000,  payoutYears: 5  }, totalPayout: 60000,   nominalReturn: 10000,   simplePayoutRatio: 120  },
  { id: 'F5', inputs: { premium: 100000, deferralYears: 10, monthlyPayout: 12750, payoutYears: 13 }, totalPayout: 1989000, nominalReturn: 1889000, simplePayoutRatio: 1989 },
  { id: 'F6', inputs: { premium: 100000, deferralYears: 10, monthlyPayout: 750,   payoutYears: 13 }, totalPayout: 117000,  nominalReturn: 17000,   simplePayoutRatio: 117  },
];

describe('deriveSummary — parity fixtures', () => {
  it.each(summaryFixtures)(
    '$id: totalPayout/nominalReturn/simplePayoutRatio match to exact equality',
    (f) => {
      const s = deriveSummary(f.inputs);
      expect(s.totalPayout).toBe(f.totalPayout);
      expect(s.nominalReturn).toBe(f.nominalReturn);
      expect(s.simplePayoutRatio).toBe(f.simplePayoutRatio);
    }
  );
});

describe('deriveSummary — edge cases', () => {
  it('premium=0 → simplePayoutRatio is NaN (guarded per helper contract)', () => {
    const s = deriveSummary({ premium: 0, deferralYears: 0, monthlyPayout: 100, payoutYears: 5 });
    expect(s.totalPayout).toBe(6000);
    expect(s.nominalReturn).toBe(6000);
    expect(Number.isNaN(s.simplePayoutRatio)).toBe(true);
  });

  it('nominalReturn is negative when totalPayout < premium', () => {
    const s = deriveSummary({ premium: 100000, deferralYears: 0, monthlyPayout: 500, payoutYears: 10 });
    expect(s.totalPayout).toBe(60000);
    expect(s.nominalReturn).toBe(-40000);
    expect(s.simplePayoutRatio).toBe(60);
  });

  it('no rounding at compute time (fractional inputs propagate)', () => {
    const s = deriveSummary({ premium: 123.45, deferralYears: 0, monthlyPayout: 10, payoutYears: 1 });
    expect(s.totalPayout).toBe(120);
    expect(s.nominalReturn).toBeCloseTo(120 - 123.45, 10);
    expect(s.simplePayoutRatio).toBeCloseTo((120 / 123.45) * 100, 10);
  });
});
