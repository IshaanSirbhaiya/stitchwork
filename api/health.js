// Vercel function (Node.js runtime, Web-standard signature). Logic: server/handler.ts, bundled by `npm run build:api`.
import { handleHealth } from "./_lib/stitchwork-api.mjs";

export function GET() {
  return handleHealth({ secret: process.env.STITCH_SECRET, walnutUrl: process.env.STITCH_WALNUT_URL, sessionKey: process.env.STITCH_SESSION_KEY });
}
