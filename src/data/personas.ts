import type { Persona } from "../engine/types";

// Fictional people at the fictional Hollowmere Assurance.
export const PERSONAS: Persona[] = [
  { userId: "mara", name: "Mara Quill", role: "Claims Analyst", groups: ["everyone", "staff", "claims"] },
  { userId: "theo", name: "Theo Marsh", role: "Account Manager", groups: ["everyone", "staff", "sales"] },
  { userId: "iris", name: "Iris Vane", role: "Compliance Officer and Data Steward", groups: ["everyone", "staff", "compliance", "fincrime", "steward"] },
  { userId: "nova", name: "Nova Reyes", role: "People Partner", groups: ["everyone", "staff", "hr"] },
  { userId: "sam", name: "Sam Pike", role: "Facilities Contractor", groups: ["everyone", "contractors"] },
];

export function personaById(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.userId === id);
}

export const SAMPLE_QUESTIONS = [
  "What is the refund window for cancelled policies?",
  "How fast must we acknowledge a new claim?",
  "Is Gravewell Logistics under investigation?",
  "What discount can an account manager approve?",
  "Can I work remotely?",
  "Who fixes the lantern room heating?",
  "What caused the claims portal outage?",
];
