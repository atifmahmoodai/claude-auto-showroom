export interface FinanceInput {
  price: number;
  deposit: number;
  aprPercent: number;
  termMonths: number;
}

export interface FinanceResult {
  principal: number;
  monthly: number;
  totalPaid: number;
  totalInterest: number;
}

/** Standard amortised loan repayment. Handles 0% APR and deposits above the price. */
export function calcFinance({ price, deposit, aprPercent, termMonths }: FinanceInput): FinanceResult {
  const principal = Math.max(0, price - Math.max(0, deposit));
  const n = Math.max(1, Math.round(termMonths));
  const r = Math.max(0, aprPercent) / 100 / 12;
  const monthly = principal === 0 ? 0 : r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  const totalPaid = monthly * n;
  return { principal, monthly, totalPaid, totalInterest: totalPaid - principal };
}
