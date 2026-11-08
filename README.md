# Emil-portfolio
It’s about my first website

The site is an immersive 3D experience: scrolling flies a camera through a Three.js world
(holographic globe, one 3D "station" per section) while each section floats in as a glass panel.
The 3D layer lives in `js/scene3d.js`; the page still works without WebGL.

## Hosting (Cloudflare Workers)
The site is served by a Cloudflare Worker with static assets:
- `wrangler.jsonc` — Worker config; site files are served from the repo root.
- `worker/index.js` — serves the home page at `/` and returns 404 for unknown paths.
- `_headers` — security and cache headers.
- `.assetsignore` — repo files that are never published (README, config, `.git`, etc.).

Cloudflare Workers Builds deploys automatically on every push to `main`.
To preview locally: `npx wrangler dev`.
