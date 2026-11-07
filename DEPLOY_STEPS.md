# Deploy steps

Nothing has been deployed yet. These steps are written from the repository's configuration; the API on Vercel is **unverified until you run step 4**.

## Option 1 (recommended): Vercel, UI plus API, free Hobby plan

1. Push the repository to a **public** GitHub repo. Check that `.kiro/` is in the push and that GitHub shows "MIT license" in the About panel.
2. In Vercel: Add New Project, import the repo. Vercel reads `vercel.json` (build `npm run build`, output `dist`). Leave the framework as Vite.
3. Settings, Environment Variables: add `STITCH_SECRET` for Production with a random value of at least 32 characters, for example the output of:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Redeploy after adding it.
4. Verify against the live URL (replace `$URL`):
   ```bash
   curl -s $URL/api/health
   # expect {"ok":true,"configured":true,...}
   TOKEN=$(curl -s -X POST $URL/api/session -H "content-type: application/json" -d '{"persona":"theo"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
   curl -s -X POST $URL/api/ask -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
     -d '{"question":"Is Gravewell Logistics under investigation?","persona":"iris"}'
   # expect "asker":"theo", no FIN-13 and no gate1Denied anywhere, "cryptSealed":3 and no "crypt" field
   curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/ask -H "content-type: application/json" -d '{"question":"hi"}'
   # expect 401
   ```
   Leave `STITCH_SESSION_KEY` unset so judges can switch persona with no login: the session response then says `"demoIdentity":true`, and anyone can be any persona. Say so in the testing instructions. Set it (at least 32 characters) if you ever want to close that door.
5. Open the URL in a private window and run the "Try it in 90 seconds" steps from README.md (steps 1, 3, 4 and 6; the Walnut steps need Option 3).
6. Tick task 11 in `.kiro/specs/permission-gates/tasks.md` and paste the curl output into TEST_REPORT.md under a dated heading.

If the API returns 404 or 500: check the Functions tab of the deployment. The wrappers in `api/*.js` import the pre-built bundle `api/_lib/stitchwork-api.mjs`; make sure that file was committed (`git ls-files api/_lib`).

## Option 2: Netlify or Cloudflare Pages, UI only

The whole UI works without the API.

- Netlify: import the repo; `netlify.toml` sets build `npm run build` and publish `dist`.
- Cloudflare Pages: build command `npm run build`, output directory `dist`, Node 20 or newer.

The API tab in the app will show curl commands that return 404 on these hosts. Say "UI demo on Netlify; API on Vercel" in the submission if you split hosts.

## Option 3: with the Walnut stitches (any host that keeps a process alive)

Vercel functions cannot run the Python service, so the hosted demo above runs without Walnut. To show the stitches on a public URL, use one small VM or container (not done or tested yet):

1. `python -m pip install -r requirements-walnut.txt` and `npm ci && npm run build`.
2. Set `STITCH_WALNUT_KEY` and `STITCH_WALNUT_CALLER_KEY` (each at least 32 characters, kept out of git), and `STITCH_WALNUT_ALLOW_HOSTS` to your public host name, then run `python -m stitch_walnut --port 4711` under a process manager. It binds to 127.0.0.1 only and refuses any other Host or Origin.
3. Serve `dist/` and proxy `/walnut` to `http://127.0.0.1:4711`, adding the `x-stitch-caller-key` header in the proxy (`STITCH_WALNUT_URL=http://127.0.0.1:4711 STITCH_WALNUT_CALLER_KEY=... npx vite preview` does this for a demo; use a real web server for anything longer).
4. Check: the header says "Walnut stitches attached", and the Crypt tab's "Verify Walnut Crypt" reports the sealed count.

Know what this exposes: the browser client has no key of its own, so that proxy lets anyone on the internet seal demo events into this Crypt, run the wall and read the sealed count. No route returns Crypt records, so they cannot read what others asked. Fine for a synthetic demo, not for real data. For real use, keep the stitches behind the API (`STITCH_WALNUT_URL` on the server) and do not proxy `/walnut`.

## Before submitting

- The deployment must stay up and free to use until judging ends on 29 Jan 2027.
- No login is needed: personas are switched in the header.
- Re-run `npm test` and `npm run build` on the exact commit you submit.
