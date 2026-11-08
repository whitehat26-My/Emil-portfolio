// Immersive 3D layer for the portfolio.
//
// The page content stays as normal HTML (so scrolling, links, forms and SEO keep working).
// This module adds, on top of it:
//   1. A fixed Three.js world behind the page. Scrolling flies the camera from one
//      "station" (one per section) to the next.
//   2. Glass panels that rise out of depth as their section scrolls into view.
//   3. A 3D tilt on cards that follows the mouse, and a side HUD showing the current station.
//
// Parts 2 and 3 work even when WebGL or the Three.js CDN is unavailable.

const STATION_IDS = ['home', 'about', 'duality', 'services', 'work', 'reviews', 'contact'];
const STATION_NAMES = ['Home', 'About', 'Duality', 'Services', 'My Work', 'Reviews', 'Contact'];

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const isSmallScreen = () => window.innerWidth < 768;

function finishBoot() {
    root.classList.remove('is-booting');
}

// ---------------------------------------------------------------------------
// Scroll position → station progress (0 … stations-1)
// ---------------------------------------------------------------------------
const stations = STATION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
let anchors = [];

// The scroll position at which each section is centred in the viewport.
function computeAnchors() {
    const vh = window.innerHeight;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    anchors = stations.map((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        return clamp(top + el.offsetHeight / 2 - vh / 2, 0, maxScroll);
    });
    anchors[0] = 0;
    for (let i = 1; i < anchors.length; i++) {
        anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
    }
}

function scrollProgress() {
    const y = window.scrollY;
    if (!anchors.length || y <= anchors[0]) return 0;
    for (let i = 1; i < anchors.length; i++) {
        if (y <= anchors[i]) {
            return i - 1 + (y - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
        }
    }
    return anchors.length - 1;
}

// ---------------------------------------------------------------------------
// Glass panels flying in from depth
// ---------------------------------------------------------------------------
// The section (untransformed) is measured, the panel inside it is transformed,
// so the transform never feeds back into the measurement.
const panels = Array.from(document.querySelectorAll('.panel-3d')).map((panel) => ({
    panel,
    section: panel.closest('section, footer') || panel.parentElement,
    k: -1,
}));

function updatePanels() {
    if (reducedMotion) return;
    const vh = window.innerHeight;
    for (const item of panels) {
        const r = item.section.getBoundingClientRect();
        const enter = clamp((vh - r.top) / (vh * 0.55), 0, 1);
        const exit = clamp(r.bottom / (vh * 0.55), 0, 1);
        const k = easeOutCubic(Math.min(enter, exit));
        if (Math.abs(k - item.k) < 0.001) continue;
        item.k = k;

        if (k > 0.999) {
            item.panel.style.transform = '';
            item.panel.style.opacity = '';
            continue;
        }
        const inv = 1 - k;
        const dir = enter < exit ? 1 : -1; // 1 = rising in from below, -1 = leaving at top
        item.panel.style.transform =
            `perspective(1400px) translate3d(0, ${(dir * inv * 80).toFixed(1)}px, ${(-inv * 520).toFixed(1)}px) ` +
            `rotateX(${(dir * inv * 24).toFixed(2)}deg)`;
        item.panel.style.opacity = (0.08 + 0.92 * k).toFixed(3);
    }
}

// ---------------------------------------------------------------------------
// Station HUD (side dots + readout)
// ---------------------------------------------------------------------------
const hudDots = Array.from(document.querySelectorAll('#station-hud [data-station]'));
const hudReadout = document.getElementById('hud-readout');
const scrollHint = document.getElementById('scroll-hint');
let lastStation = -1;

function updateHud(progress) {
    const current = Math.round(progress);
    if (current !== lastStation) {
        lastStation = current;
        hudDots.forEach((dot, i) => dot.classList.toggle('is-active', i === current));
        if (hudReadout) {
            hudReadout.querySelector('[data-readout-num]').textContent = String(current).padStart(2, '0');
            hudReadout.querySelector('[data-readout-name]').textContent = STATION_NAMES[current] || '';
        }
    }
    if (hudReadout) {
        hudReadout.querySelector('[data-readout-depth]').textContent =
            String(Math.round(progress * 55)).padStart(4, '0');
    }
    if (scrollHint) scrollHint.classList.toggle('is-hidden', window.scrollY > 40);
}

// ---------------------------------------------------------------------------
// Card tilt toward the mouse
// ---------------------------------------------------------------------------
function initCardTilt() {
    if (!finePointer || reducedMotion) return;
    let active = null;

    function reset(card) {
        card.style.transform = '';
        card.classList.remove('is-tilting');
    }

    document.addEventListener('pointermove', (e) => {
        const card = e.target.closest ? e.target.closest('.hud-card') : null;
        if (active && active !== card) reset(active);
        active = card;
        if (!card) return;

        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const maxDeg = 12 * Math.min(1, 420 / r.width);
        card.classList.add('is-tilting');
        card.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
        const lift = card.hasAttribute('data-no-lift') ? 0 : -8;
        card.style.transform =
            `perspective(900px) rotateX(${(-py * maxDeg).toFixed(2)}deg) rotateY(${(px * maxDeg).toFixed(2)}deg) translateY(${lift}px)`;
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
        if (active) reset(active);
        active = null;
    });
}

// ---------------------------------------------------------------------------
// The WebGL world
// ---------------------------------------------------------------------------
async function initWorld() {
    const canvas = document.getElementById('scene-3d');
    if (!canvas) return null;

    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;

    const THREE = await import('three');

    const CYAN = 0x22d3ee;
    const SKY = 0x38bdf8;
    const PURPLE = 0xa855f7;
    const YELLOW = 0xfacc15;
    const BG = 0x020617;
    const small = isSmallScreen();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(BG, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.011);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);

    // --- Shared helpers ---------------------------------------------------
    function makeGlowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }
    const glowTex = makeGlowTexture();

    function glowSprite(color, size, opacity = 1) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color, transparent: true, opacity,
            depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        s.scale.set(size, size, 1);
        return s;
    }

    function textSprite(text, color, height = 1, font = 'bold 72px "Courier New", monospace') {
        const c = document.createElement('canvas');
        const g = c.getContext('2d');
        g.font = font;
        const w = Math.ceil(g.measureText(text).width) + 24;
        c.width = w;
        c.height = 96;
        g.font = font;
        g.textBaseline = 'middle';
        g.fillStyle = color;
        g.shadowColor = color;
        g.shadowBlur = 16;
        g.fillText(text, 12, 50);
        const tex = new THREE.CanvasTexture(c);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        s.scale.set(height * (w / 96), height, 1);
        return s;
    }

    function lineMat(color, opacity) {
        return new THREE.LineBasicMaterial({
            color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
        });
    }

    function wire(geometry, color, opacity = 0.9) {
        return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMat(color, opacity));
    }

    function circlePoints(radius, segments = 128) {
        const pts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
        }
        return pts;
    }

    function circleLine(radius, color, opacity) {
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(radius)), lineMat(color, opacity));
    }

    const updaters = []; // (time, dt) => void

    // --- Station positions (where each section's set piece sits) -----------
    const P = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-16, 4, -60),
        new THREE.Vector3(16, -1, -120),
        new THREE.Vector3(-14, 3, -180),
        new THREE.Vector3(16, 1, -240),
        new THREE.Vector3(-12, -1, -300),
        new THREE.Vector3(0, 2, -360),
    ];

    // --- Starfield ---------------------------------------------------------
    {
        const count = small ? 1400 : 3500;
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const palette = [new THREE.Color(0xffffff), new THREE.Color(CYAN), new THREE.Color(SKY), new THREE.Color(PURPLE)];
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 360;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 200;
            pos[i * 3 + 2] = 80 - Math.random() * 560;
            const c = palette[Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3)];
            col.set([c.r, c.g, c.b], i * 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const stars = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.7, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        }));
        scene.add(stars);
        updaters.push((t) => { stars.rotation.z = t * 0.004; });
    }

    // --- Grid floor --------------------------------------------------------
    {
        const grid = new THREE.GridHelper(900, 180, CYAN, CYAN);
        grid.material.transparent = true;
        grid.material.opacity = 0.16;
        grid.material.depthWrite = false;
        grid.position.set(0, -14, -180);
        scene.add(grid);
        const ceiling = grid.clone();
        ceiling.material = grid.material.clone();
        ceiling.material.opacity = 0.05;
        ceiling.position.y = 26;
        scene.add(ceiling);
    }

    // --- Station 0: holographic globe -------------------------------------
    {
        const R = 3.6;
        const globe = new THREE.Group();
        globe.position.copy(P[0]);
        scene.add(globe);

        const spin = new THREE.Group();
        spin.rotation.z = 0.35;
        globe.add(spin);

        // Dark core hides the dots on the far side, giving the globe a solid body.
        spin.add(new THREE.Mesh(
            new THREE.SphereGeometry(R * 0.985, 48, 32),
            new THREE.MeshBasicMaterial({ color: 0x031426 }),
        ));

        // Fibonacci-distributed dots; a cheap "noise" makes continent-like bright patches.
        const n = small ? 1600 : 2600;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const bright = new THREE.Color(CYAN);
        const dim = new THREE.Color(0x0e3a4a);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
            const y = 1 - (i / (n - 1)) * 2;
            const rr = Math.sqrt(1 - y * y);
            const th = golden * i;
            const x = Math.cos(th) * rr;
            const z = Math.sin(th) * rr;
            pos.set([x * R * 1.003, y * R * 1.003, z * R * 1.003], i * 3);
            const land = Math.sin(x * 3.1 + 1.3) * Math.sin(y * 4.3 + 0.7) * Math.sin(z * 2.7 + 2.1)
                + 0.45 * Math.sin(x * 7.0 + z * 5.0) * Math.sin(y * 6.0 - 1.2);
            const c = land > 0.08 ? bright : dim;
            col.set([c.r, c.g, c.b], i * 3);
        }
        const dotsGeo = new THREE.BufferGeometry();
        dotsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        dotsGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        spin.add(new THREE.Points(dotsGeo, new THREE.PointsMaterial({
            size: 0.11, map: glowTex, vertexColors: true, transparent: true,
            depthWrite: false, blending: THREE.AdditiveBlending,
        })));

        // Latitude / longitude lines.
        {
            const pts = [];
            const lr = R * 1.006;
            for (let lat = -75; lat <= 75; lat += 15) {
                const phi = THREE.MathUtils.degToRad(lat);
                const cr = Math.cos(phi) * lr;
                const cy = Math.sin(phi) * lr;
                for (let i = 0; i < 72; i++) {
                    const a1 = (i / 72) * Math.PI * 2;
                    const a2 = ((i + 1) / 72) * Math.PI * 2;
                    pts.push(new THREE.Vector3(Math.cos(a1) * cr, cy, Math.sin(a1) * cr));
                    pts.push(new THREE.Vector3(Math.cos(a2) * cr, cy, Math.sin(a2) * cr));
                }
            }
            for (let lon = 0; lon < 180; lon += 20) {
                const th = THREE.MathUtils.degToRad(lon);
                for (let i = 0; i < 72; i++) {
                    const a1 = (i / 72) * Math.PI * 2;
                    const a2 = ((i + 1) / 72) * Math.PI * 2;
                    pts.push(new THREE.Vector3(Math.cos(a1) * Math.cos(th) * lr, Math.sin(a1) * lr, Math.cos(a1) * Math.sin(th) * lr));
                    pts.push(new THREE.Vector3(Math.cos(a2) * Math.cos(th) * lr, Math.sin(a2) * lr, Math.cos(a2) * Math.sin(th) * lr));
                }
            }
            spin.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat(CYAN, 0.1)));
        }

        // Rim light on the globe and a soft atmosphere around it.
        const fresnelVert = `
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vView = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`;
        globe.add(new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.01, 64, 48),
            new THREE.ShaderMaterial({
                vertexShader: fresnelVert,
                fragmentShader: `
                    uniform vec3 uColor;
                    varying vec3 vNormal;
                    varying vec3 vView;
                    void main() {
                        float f = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
                        gl_FragColor = vec4(uColor, f * 0.9);
                    }`,
                uniforms: { uColor: { value: new THREE.Color(CYAN) } },
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        ));
        globe.add(new THREE.Mesh(
            new THREE.SphereGeometry(R * 1.35, 64, 48),
            new THREE.ShaderMaterial({
                vertexShader: fresnelVert,
                fragmentShader: `
                    uniform vec3 uColor;
                    varying vec3 vNormal;
                    varying vec3 vView;
                    void main() {
                        float f = pow(max(-dot(vNormal, vView), 0.0), 2.4);
                        gl_FragColor = vec4(uColor, f * 0.55);
                    }`,
                uniforms: { uColor: { value: new THREE.Color(SKY) } },
                side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        ));

        // Arcs between random points, drawn on like data packets.
        const arcs = [];
        const unit = () => new THREE.Vector3().randomDirection();
        for (let i = 0; i < (small ? 6 : 10); i++) {
            const a = unit().multiplyScalar(R * 1.01);
            const b = unit().multiplyScalar(R * 1.01);
            if (a.distanceTo(b) < R * 0.6) { i--; continue; }
            const mid = a.clone().add(b).normalize().multiplyScalar(R * (1.2 + a.distanceTo(b) / (R * 6)));
            const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(60);
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(i % 3 ? CYAN : PURPLE, 0.85));
            spin.add(line);
            arcs.push({ line, phase: Math.random() * 2, speed: 0.25 + Math.random() * 0.3 });
        }

        // Scan ring sweeping over the surface.
        const scan = circleLine(1, CYAN, 0.6);
        globe.add(scan);

        // Orbit rings with satellites.
        const orbits = [
            { r: R * 1.5, tiltX: 1.2, tiltZ: 0.3, speed: 0.5, color: CYAN },
            { r: R * 1.75, tiltX: 1.75, tiltZ: -0.5, speed: -0.35, color: PURPLE },
            { r: R * 2.05, tiltX: 1.45, tiltZ: 0.9, speed: 0.22, color: SKY },
        ].map((o) => {
            const g = new THREE.Group();
            g.rotation.set(o.tiltX - Math.PI / 2, 0, o.tiltZ);
            g.add(circleLine(o.r, o.color, 0.35));
            const sat = new THREE.Group();
            sat.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })));
            sat.add(glowSprite(o.color, 0.9));
            g.add(sat);
            globe.add(g);
            return { ...o, group: g, sat };
        });

        const pointer = { x: 0, y: 0 };
        window.addEventListener('pointermove', (e) => {
            pointer.x = e.clientX / window.innerWidth - 0.5;
            pointer.y = e.clientY / window.innerHeight - 0.5;
        }, { passive: true });

        updaters.push((t) => {
            spin.rotation.y = t * 0.12;
            globe.rotation.x += (pointer.y * 0.35 - globe.rotation.x) * 0.05;
            globe.rotation.y += (pointer.x * 0.6 - globe.rotation.y) * 0.05;

            for (const arc of arcs) {
                const p = (arc.phase + t * arc.speed) % 2;
                const total = 61;
                const start = p > 1 ? Math.floor((p - 1) * total) : 0;
                const end = p > 1 ? total : Math.floor(p * total);
                arc.line.geometry.setDrawRange(start, Math.max(0, end - start));
            }

            const h = Math.sin(t * 0.6) * R * 0.95;
            const sr = Math.sqrt(Math.max(0.0001, R * R - h * h)) * 1.02;
            scan.position.y = h;
            scan.scale.set(sr, 1, sr);

            for (const o of orbits) {
                const a = t * o.speed;
                o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
            }
        });
    }

    // --- Station 1: About — floating "numbers meet code" glyphs -----------
    {
        const g = new THREE.Group();
        g.position.copy(P[1]);
        scene.add(g);
        const core = wire(new THREE.DodecahedronGeometry(2), CYAN, 0.8);
        g.add(core);
        g.add(glowSprite(CYAN, 7, 0.35));
        const glyphs = ['</>', '{ }', '01', 'Σ', '$', 'fn()', '%', '[ ]', '=>', '0x1F', '∑x', 'RM'];
        const items = glyphs.map((txt, i) => {
            const s = textSprite(txt, i % 3 === 0 ? '#a855f7' : '#22d3ee', 0.9 + Math.random() * 0.5);
            const a = (i / glyphs.length) * Math.PI * 2;
            const base = new THREE.Vector3(Math.cos(a) * (4.5 + Math.random() * 2.5), (Math.random() - 0.5) * 6, Math.sin(a) * (3 + Math.random() * 2));
            s.position.copy(base);
            g.add(s);
            return { s, base, ph: Math.random() * Math.PI * 2 };
        });
        updaters.push((t) => {
            core.rotation.set(t * 0.2, t * 0.3, 0);
            g.rotation.y = t * 0.1;
            for (const it of items) it.s.position.y = it.base.y + Math.sin(t * 0.9 + it.ph) * 0.5;
        });
    }

    // --- Station 2: Duality — debit/credit balance -------------------------
    {
        const g = new THREE.Group();
        g.position.copy(P[2]);
        scene.add(g);
        const pillar = wire(new THREE.CylinderGeometry(0.15, 0.6, 5, 6), CYAN, 0.7);
        pillar.position.y = -2.5;
        g.add(pillar);
        const beam = new THREE.Group();
        g.add(beam);
        beam.add(wire(new THREE.BoxGeometry(22, 0.15, 0.15), CYAN, 0.9));
        beam.add(glowSprite(CYAN, 1.6));

        const makeCube = (x, color, label) => {
            const cube = new THREE.Group();
            cube.position.set(x, 1.4, 0);
            const box = new THREE.BoxGeometry(2.4, 2.4, 2.4);
            cube.add(wire(box, color, 1));
            cube.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending,
            })));
            beam.add(cube);
            const tag = textSprite(label, color === CYAN ? '#22d3ee' : '#a855f7', 0.7, 'bold 64px "Orbitron", sans-serif');
            tag.position.set(x, 3.6, 0);
            beam.add(tag);
            return cube;
        };
        const debit = makeCube(-10.5, CYAN, 'DEBIT');
        const credit = makeCube(10.5, PURPLE, 'CREDIT');

        updaters.push((t) => {
            beam.rotation.z = Math.sin(t * 0.7) * 0.06;
            debit.rotation.set(t * 0.3, t * 0.5, 0);
            credit.rotation.set(-t * 0.3, -t * 0.5, 0);
            g.rotation.y = Math.sin(t * 0.2) * 0.15;
        });
    }

    // --- Station 3: Services — three orbiting solids ------------------------
    {
        const g = new THREE.Group();
        g.position.copy(P[3]);
        scene.add(g);
        const core = wire(new THREE.IcosahedronGeometry(1.3, 1), CYAN, 0.8);
        g.add(core);
        g.add(glowSprite(CYAN, 5, 0.4));
        const ring = circleLine(5, CYAN, 0.25);
        ring.rotation.x = 0.3;
        g.add(ring);
        const solids = [
            [new THREE.TorusKnotGeometry(0.75, 0.22, 80, 10), CYAN],
            [new THREE.OctahedronGeometry(1.05), SKY],
            [new THREE.BoxGeometry(1.4, 1.4, 1.4), PURPLE],
        ].map(([geo, color], i) => {
            const m = wire(geo, color, 0.95);
            m.add(glowSprite(color, 3, 0.3));
            g.add(m);
            return { m, offset: (i / 3) * Math.PI * 2 };
        });
        updaters.push((t) => {
            core.rotation.set(t * 0.25, t * 0.35, 0);
            for (const s of solids) {
                const a = t * 0.35 + s.offset;
                s.m.position.set(Math.cos(a) * 5, Math.sin(a) * 5 * Math.sin(0.3), Math.sin(a) * 5 * Math.cos(0.3));
                s.m.rotation.set(t * 0.6, t * 0.4, 0);
            }
        });
    }

    // --- Station 4: My Work — floating screens ------------------------------
    {
        const g = new THREE.Group();
        g.position.copy(P[4]);
        scene.add(g);
        const screens = [];
        const addScreen = (x, y, z, ry, w, h, color, texUrl) => {
            const s = new THREE.Group();
            s.position.set(x, y, z);
            s.rotation.y = ry;
            const plane = new THREE.PlaneGeometry(w, h);
            const mat = new THREE.MeshBasicMaterial({ color: 0x0b2236, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
            if (texUrl) {
                new THREE.TextureLoader().load(texUrl, (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    mat.map = tex;
                    mat.color.set(0xffffff);
                    mat.opacity = 0.9;
                    mat.needsUpdate = true;
                });
            }
            s.add(new THREE.Mesh(plane, mat));
            s.add(wire(plane, color, 1));
            g.add(s);
            screens.push({ s, y, ph: Math.random() * 6 });
        };
        addScreen(0, 0, 0, 0, 7, 4.2, CYAN, 'work-clinical-reference-app.jpeg');
        addScreen(-7, 1.2, -2.5, 0.55, 4.5, 2.8, PURPLE);
        addScreen(7, -1, -2.5, -0.55, 4.5, 2.8, SKY);
        updaters.push((t) => {
            for (const sc of screens) sc.s.position.y = sc.y + Math.sin(t * 0.8 + sc.ph) * 0.35;
            g.rotation.y = Math.sin(t * 0.25) * 0.25;
        });
    }

    // --- Station 5: Reviews — rising stars ---------------------------------
    {
        const g = new THREE.Group();
        g.position.copy(P[5]);
        scene.add(g);
        const shape = new THREE.Shape();
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 0.4 : 1;
            const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
            if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
        const starGeo = new THREE.ShapeGeometry(shape);
        const starMat = new THREE.MeshBasicMaterial({
            color: YELLOW, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
            depthWrite: false, blending: THREE.AdditiveBlending,
        });
        const starsArr = [];
        for (let i = 0; i < (small ? 14 : 24); i++) {
            const m = new THREE.Mesh(starGeo, starMat);
            const sc = 0.3 + Math.random() * 0.6;
            m.scale.set(sc, sc, sc);
            m.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8);
            g.add(m);
            starsArr.push({ m, v: 0.4 + Math.random() * 0.8, spin: (Math.random() - 0.5) * 2 });
        }
        // Five big stars in a row = a 5-star rating.
        for (let i = 0; i < 5; i++) {
            const m = new THREE.Mesh(starGeo, starMat);
            m.position.set((i - 2) * 2.4, 0, 2);
            m.add(glowSprite(YELLOW, 3, 0.35));
            g.add(m);
            starsArr.push({ m, v: 0, spin: 0.8, big: true, i });
        }
        updaters.push((t, dt) => {
            for (const s of starsArr) {
                if (s.big) {
                    s.m.rotation.y = t * s.spin + s.i * 0.4;
                    s.m.position.y = Math.sin(t * 1.2 + s.i * 0.6) * 0.3;
                    continue;
                }
                s.m.position.y += s.v * dt;
                if (s.m.position.y > 7) s.m.position.y = -7;
                s.m.rotation.y += s.spin * dt;
            }
        });
    }

    // --- Station 6: Contact — a glowing gateway ----------------------------
    {
        const g = new THREE.Group();
        g.position.copy(P[6]);
        scene.add(g);
        const ringA = new THREE.Mesh(new THREE.TorusGeometry(5, 0.07, 12, 160), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        const ringB = new THREE.Mesh(new THREE.TorusGeometry(5.8, 0.03, 8, 160), new THREE.MeshBasicMaterial({ color: PURPLE, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        g.add(ringA, ringB);
        const segs = new THREE.Group();
        for (let i = 0; i < 12; i++) {
            const box = wire(new THREE.BoxGeometry(0.5, 0.18, 0.18), SKY, 0.9);
            const a = (i / 12) * Math.PI * 2;
            box.position.set(Math.cos(a) * 6.6, Math.sin(a) * 6.6, 0);
            box.rotation.z = a;
            segs.add(box);
        }
        g.add(segs);

        const vn = small ? 400 : 900;
        const vpos = new Float32Array(vn * 3);
        const seeds = [];
        for (let i = 0; i < vn; i++) seeds.push({ a: Math.random() * Math.PI * 2, r: Math.random() * 4.8, s: 0.2 + Math.random() * 0.6 });
        const vgeo = new THREE.BufferGeometry();
        vgeo.setAttribute('position', new THREE.BufferAttribute(vpos, 3));
        const vortex = new THREE.Points(vgeo, new THREE.PointsMaterial({
            size: 0.14, map: glowTex, color: CYAN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        g.add(vortex);

        const pulse = circleLine(1, CYAN, 0.8);
        pulse.rotation.x = Math.PI / 2;
        g.add(pulse);

        updaters.push((t, dt) => {
            ringA.rotation.z = t * 0.2;
            ringB.rotation.z = -t * 0.15;
            segs.rotation.z = t * 0.1;
            for (let i = 0; i < vn; i++) {
                const sd = seeds[i];
                sd.a += sd.s * dt * (1.5 + (5 - sd.r) * 0.4);
                sd.r -= dt * 0.35;
                if (sd.r < 0.15) sd.r = 4.8;
                vpos[i * 3] = Math.cos(sd.a) * sd.r;
                vpos[i * 3 + 1] = Math.sin(sd.a) * sd.r;
                vpos[i * 3 + 2] = -(4.8 - sd.r) * 0.8;
            }
            vgeo.attributes.position.needsUpdate = true;
            const p = (t * 0.4) % 1;
            pulse.scale.setScalar(1 + p * 7);
            pulse.material.opacity = 0.8 * (1 - p);
        });
    }

    // --- Camera path --------------------------------------------------------
    // Camera sits in front of each station; the home station frames the globe on
    // the right half on wide screens and near the top on phones.
    let camCurve;
    let lookCurve;
    const gates = [];

    function buildPath() {
        const wide = window.innerWidth / window.innerHeight > 1;
        const camPts = [];
        const lookPts = [];
        P.forEach((p, i) => {
            let shift = new THREE.Vector3(0, 0, 0);
            let dist = 16;
            if (i === 0) {
                shift = wide ? new THREE.Vector3(-6.5, 0.3, 0) : new THREE.Vector3(0, -4.2, 0);
                dist = wide ? 18 : 22;
            } else if (!wide) {
                dist = 22;
            }
            const look = p.clone().add(shift);
            lookPts.push(look);
            camPts.push(look.clone().add(new THREE.Vector3(0, 1.2, dist)));
        });
        camCurve = new THREE.CatmullRomCurve3(camPts, false, 'catmullrom', 0.5);
        lookCurve = new THREE.CatmullRomCurve3(lookPts, false, 'catmullrom', 0.5);

        // Ring gates the camera flies through between stations.
        gates.forEach((gt) => scene.remove(gt));
        gates.length = 0;
        for (let i = 0; i < P.length - 1; i++) {
            const t = (i + 0.5) / (P.length - 1);
            const pos = camCurve.getPoint(t);
            const tan = camCurve.getTangent(t);
            const gate = new THREE.Group();
            gate.position.copy(pos);
            gate.lookAt(pos.clone().add(tan));
            const torus = new THREE.Mesh(
                new THREE.TorusGeometry(7, 0.05, 8, 120),
                new THREE.MeshBasicMaterial({ color: i % 2 ? PURPLE : CYAN, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
            );
            gate.add(torus);
            for (let k = 0; k < 4; k++) {
                const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
                const tick = glowSprite(i % 2 ? PURPLE : CYAN, 1.2, 0.9);
                tick.position.set(Math.cos(a) * 7, Math.sin(a) * 7, 0);
                gate.add(tick);
            }
            scene.add(gate);
            gates.push(gate);
        }
    }
    buildPath();
    updaters.push((t) => gates.forEach((gt, i) => { gt.rotation.z = t * (i % 2 ? -0.15 : 0.15); }));

    // --- Loop -------------------------------------------------------------
    const camPos = new THREE.Vector3();
    const lookPos = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    window.addEventListener('pointermove', (e) => {
        mouse.x = e.clientX / window.innerWidth - 0.5;
        mouse.y = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    let current = scrollProgress();
    let time = 0;
    let bank = 0;
    const last = P.length - 1;

    function render(dt, target) {
        time += reducedMotion ? 0 : dt;
        current = reducedMotion ? target : current + (target - current) * (1 - Math.exp(-dt * 3.2));
        const t = clamp(current / last, 0, 1);

        camCurve.getPoint(t, camPos);
        lookCurve.getPoint(t, lookPos);
        camCurve.getTangent(t, tangent);

        mouse.sx += (mouse.x - mouse.sx) * 0.05;
        mouse.sy += (mouse.y - mouse.sy) * 0.05;
        camera.position.copy(camPos);
        if (!reducedMotion) {
            camera.position.x += mouse.sx * 1.6;
            camera.position.y -= mouse.sy * 1.0;
        }
        camera.lookAt(lookPos);
        const targetBank = reducedMotion ? 0 : clamp(-tangent.x * 0.25 * Math.min(1, Math.abs(target - current) * 2), -0.2, 0.2);
        bank += (targetBank - bank) * 0.05;
        camera.rotateZ(bank);

        for (const u of updaters) u(time, reducedMotion ? 0 : dt);
        renderer.render(scene, camera);
    }

    function resize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        buildPath();
    }

    return { render, resize };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
    computeAnchors();
    initCardTilt();

    let world = null;
    try {
        world = await initWorld();
    } catch (err) {
        console.warn('3D scene unavailable, using the flat background instead:', err);
    }
    root.classList.add(world ? 'has-webgl' : 'no-webgl');

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            computeAnchors();
            if (world) world.resize();
            panels.forEach((p) => { p.k = -1; });
        }, 150);
    });
    // Reviews load later and change the page height; keep anchors in sync.
    if ('ResizeObserver' in window) {
        new ResizeObserver(() => computeAnchors()).observe(document.body);
    }

    let prev = performance.now();
    let first = true;
    function tick(now) {
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        const progress = scrollProgress();
        updatePanels();
        updateHud(progress);
        if (world) world.render(dt, progress);
        if (first) {
            first = false;
            requestAnimationFrame(finishBoot);
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

boot();
