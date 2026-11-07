export function ApiPanel() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-deployment.vercel.app";
  const session = `curl -s -X POST ${origin}/api/session \\
  -H "content-type: application/json" \\
  -d '{"persona":"theo"}'`;
  const ask = `curl -s -X POST ${origin}/api/ask \\
  -H "content-type: application/json" \\
  -H "authorization: Bearer $TOKEN" \\
  -d '{"question":"Is Gravewell Logistics under investigation?","persona":"iris"}'`;
  return (
    <section aria-labelledby="api-h" className="panel">
      <h2 id="api-h">Serverless API</h2>
      <p className="lede">
        The same engine runs as Vercel functions. There, identity comes only from a signed token: the <code>"persona":"iris"</code> field in the second call is ignored, so Theo still cannot reach the financial crime case. A data steward's response carries its three Crypt entries as a sealed receipt. Anyone else gets only the count, because those entries record how much was denied.
      </p>
      <p className="notice">Demo identity: there is no login here, so step 1 gives a token for any persona to anyone, Iris included. This shows that the gates hold for a given identity. It is not authentication. Setting <code>STITCH_SESSION_KEY</code> closes step 1.</p>
      <h3>1. Get a short-lived token (15 minutes)</h3>
      <pre className="code">{session}</pre>
      <h3>2. Ask with it</h3>
      <pre className="code">{ask}</pre>
      <h3>3. Health</h3>
      <pre className="code">{`curl -s ${origin}/api/health`}</pre>
      <p className="fine">
        The API needs the <code>STITCH_SECRET</code> environment variable (32 characters or more). Without it every call except health returns 503 <code>not_configured</code>. On static hosts (Netlify, Cloudflare Pages) the UI works fully and the API is absent.
      </p>
    </section>
  );
}
