import type { SourceKind } from "../engine/types";

export const KIND_LABEL: Record<SourceKind, string> = {
  wiki: "Wiki",
  ticket: "Tickets",
  chat: "Chat",
  sheet: "Sheets",
};

export const KIND_ORDER: SourceKind[] = ["wiki", "ticket", "chat", "sheet"];

/** Small inline glyphs, so there is no icon font or network request. */
export function KindGlyph({ kind, size = 18 }: { kind: SourceKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (kind) {
    case "wiki":
      return (
        <svg {...common}>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M15 3v4h4M9 12h7M9 16h7" />
        </svg>
      );
    case "ticket":
      return (
        <svg {...common}>
          <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z" transform="translate(0 2)" />
          <path d="M14 6v12" strokeDasharray="2 2" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
      );
    case "sheet":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
          <path d="M4 10h16M4 15h16M10 4v16" />
        </svg>
      );
  }
}

export function BoltMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--slab-2)" />
      <path d="M14 44 L32 14 L50 44" fill="none" stroke="var(--thread)" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 5" />
      <path d="M30 26 L36 32 L29 36 L35 44" fill="none" stroke="var(--volt)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
