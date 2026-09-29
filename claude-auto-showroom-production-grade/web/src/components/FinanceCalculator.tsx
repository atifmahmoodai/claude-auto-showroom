import { useState } from "react";
import { SITE } from "../config";
import { calcFinance } from "../lib/finance";
import { fmtMoney } from "../lib/format";

const TERMS = [24, 36, 48, 60, 72];

export function FinanceCalculator({ price }: { price: number }) {
  const [deposit, setDeposit] = useState(Math.round((price * SITE.finance.depositPercent) / 100));
  const [term, setTerm] = useState(SITE.finance.termMonths);
  const [apr, setApr] = useState(SITE.finance.aprPercent);
  const safeDeposit = Math.min(Math.max(0, deposit || 0), price);
  const r = calcFinance({ price, deposit: safeDeposit, aprPercent: apr || 0, termMonths: term });

  return (
    <div className="stack">
      <label>
        Deposit: {fmtMoney(safeDeposit)}
        <input
          type="range"
          min={0}
          max={price}
          step={Math.max(100, Math.round(price / 100 / 100) * 100)}
          value={safeDeposit}
          onChange={(e) => setDeposit(Number(e.target.value))}
        />
      </label>
      <div className="two-col">
        <label>
          Term
          <select value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {t} months
              </option>
            ))}
          </select>
        </label>
        <label>
          APR %
          <input type="number" min={0} max={40} step={0.1} value={apr} onChange={(e) => setApr(Math.min(40, Math.max(0, Number(e.target.value))))} />
        </label>
      </div>
      <div className="calc-result">
        <div className="muted small">Estimated monthly payment</div>
        <strong>{fmtMoney(r.monthly)}</strong>
        <div className="small muted">
          Borrowing {fmtMoney(r.principal)} · total interest {fmtMoney(r.totalInterest)}
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Illustration only, not a credit offer. Final rate depends on approval.
      </p>
    </div>
  );
}
