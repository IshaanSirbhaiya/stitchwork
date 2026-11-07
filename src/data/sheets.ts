import type { SheetMeta } from "../engine/adapters/sheet";

// Synthetic spreadsheets. Each entry is [meta, csv].
export const SHEETS: [SheetMeta, string][] = [
  [
    { id: "premium-rates-2025", title: "Premium Rates 2025", docKey: "premium-rates", version: 1, updatedAt: "2025-01-05", groups: ["sales", "compliance"] },
    `product,annual rate,minimum premium
Home Basic,1.8%,"SGD 240"
Fleet Cover,3.1%,"SGD 1,900"
`,
  ],
  [
    { id: "premium-rates-2026", title: "Premium Rates 2026", docKey: "premium-rates", version: 2, updatedAt: "2026-07-01", groups: ["sales", "compliance"] },
    `product,annual rate,minimum premium
Home Basic,2.0%,"SGD 260"
Fleet Cover,3.4%,"SGD 2,050"
`,
  ],
  [
    { id: "claims-kpis", title: "Claims KPIs Q3 2026", updatedAt: "2026-10-05", groups: ["staff"] },
    `month,claims logged,median days to acknowledge
July,312,1.6
August,298,1.4
September,355,1.9
`,
  ],
  [
    { id: "headcount", title: "Headcount by Team", updatedAt: "2026-09-30", groups: ["hr"] },
    `team,headcount,open roles
Claims,14,2
Sales,9,1
Compliance,4,0
`,
  ],
];
