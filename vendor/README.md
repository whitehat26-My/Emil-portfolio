# Third-party libraries (self-hosted)

These files are served from this site instead of outside CDNs, so the site never runs code
it hasn't reviewed (and the Content-Security-Policy can allow scripts from this site only).
Each file is a byte-for-byte copy of the npm release below.

| Folder | Package | Version | Licence |
|---|---|---|---|
| `firebase/` | `firebase` (`firebase-app-compat.js`, `firebase-firestore-compat.js`) | 10.13.2 | Apache-2.0 |
| `phosphor/` | `@phosphor-icons/web` (`src/regular`, `src/fill`; WOFF2/WOFF only) | 2.1.2 | MIT (see `phosphor/LICENSE`) |
| `three/` | `three` (`build/three.module.min.js`) | 0.160.0 | MIT (see `three/LICENSE`) |

To update one, replace the files with the new release and bump the `?v=` on its link in `index.html`.
