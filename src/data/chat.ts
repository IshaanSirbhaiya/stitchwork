import type { ChatExport } from "../engine/adapters/chat";

// Synthetic chat exports. The card number and ID below are well-known test values and are masked on ingest.
export const CHAT_EXPORTS: ChatExport[] = [
  {
    channel: "claims-floor",
    groups: ["staff"],
    messages: [
      { ts: "2026-10-02T09:14:00Z", user: "devon", text: "Reminder for the phones today: the refund window is 30 days, customers love it." },
      { ts: "2026-10-09T11:02:00Z", user: "mara", text: "Storm surge claims over SGD 20,000 come to me. Please photograph the water line first." },
      { ts: "2026-10-21T15:40:00Z", user: "devon", text: "A caller read out their card 4111 1111 1111 1111 to pay the excess, I logged it on the claim." },
    ],
  },
  {
    channel: "sales-deals",
    groups: ["sales"],
    messages: [
      { ts: "2026-10-18T10:05:00Z", user: "theo", text: "Gravewell Logistics renewal is on track. They are asking for a 12 percent discount on the fleet policy." },
      { ts: "2026-10-19T08:30:00Z", user: "rhea", text: "12 percent is above account manager authority, so it goes to the Head of Sales." },
    ],
  },
  {
    channel: "fincrime-room",
    private: true,
    members: ["iris"],
    messages: [
      { ts: "2026-10-30T17:20:00Z", user: "iris", text: "FIN-13: holding all Gravewell Logistics refunds. Director ID S1234567D matches a prior case. Do not inform the account team." },
    ],
  },
];
