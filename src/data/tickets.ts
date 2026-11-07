import type { TicketExport } from "../engine/adapters/tickets";

// Synthetic ticket exports for the fictional Hollowmere Assurance.
export const TICKET_EXPORTS: TicketExport[] = [
  {
    project: "CLM",
    groups: ["staff"],
    issues: [
      {
        key: "CLM-101",
        summary: "Storm surge claims backlog",
        status: "In Progress",
        updated: "2026-10-28",
        description: "Forty one storm surge claims from the October high tide are waiting for assessment. Two extra assessors start Monday.",
      },
      {
        key: "CLM-114",
        summary: "Website still shows the old refund window",
        status: "To Do",
        updated: "2026-10-15",
        description: "The public FAQ page still says refunds are possible within 30 days. The handbook changed this to 14 days in September.",
      },
      { summary: "Draft without a key (malformed export row)", status: "To Do" },
    ],
  },
  {
    project: "OPS",
    groups: ["staff"],
    issues: [
      {
        key: "OPS-7",
        summary: "Claims portal outage on 12 October",
        status: "Done",
        updated: "2026-10-14",
        description: "The claims portal was down for 47 minutes because an expired TLS certificate broke the upload service. The certificate is now renewed automatically.",
      },
    ],
  },
  {
    project: "FIN",
    groups: ["fincrime"],
    issues: [
      {
        key: "FIN-13",
        summary: "Suspicious premium refunds: Gravewell Logistics",
        status: "Investigating",
        updated: "2026-10-30",
        security: ["fincrime"],
        description: "Gravewell Logistics requested nine cancellations and refunds in six weeks to different bank accounts. Investigation open; refunds held. Case lead: Iris Vane.",
      },
    ],
  },
  {
    project: "HR",
    groups: ["hr"],
    issues: [
      {
        key: "HR-4",
        summary: "Annual salary review cycle",
        status: "In Progress",
        updated: "2026-10-01",
        description: "Salary review letters go out on 1 December. Managers submit recommendations by 15 November.",
      },
    ],
  },
  {
    project: "FAC",
    groups: ["everyone"],
    issues: [
      {
        key: "FAC-3",
        summary: "Lantern room heating broken",
        status: "Assigned",
        updated: "2026-11-02",
        description: "Sam Pike from facilities fixes the lantern room heating on Thursday. Until then the heater trips the breaker.",
      },
    ],
  },
];
