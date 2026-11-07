// Vercel function (Node.js runtime, Web-standard signature). Logic: server/handler.ts, bundled by `npm run build:api`.
import { handleAsk } from "./_lib/stitchwork-api.mjs";

export function POST(request) {
  return handleAsk(request, { secret: process.env.STITCH_SECRET, walnutUrl: process.env.STITCH_WALNUT_URL, walnutCallerKey: process.env.STITCH_WALNUT_CALLER_KEY, sessionKey: process.env.STITCH_SESSION_KEY });
}
