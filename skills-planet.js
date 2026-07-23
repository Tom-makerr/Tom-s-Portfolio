// ============================================================================
// skills-planet.js — Globe 3D "Compétences" (Three.js autonome)
// ----------------------------------------------------------------------------
// Sphère façon globe terrestre (texture continents + relief, rotation lente)
// entourée de compétences en orbite (labels HTML via CSS2DRenderer).
// Fond transparent (alpha:true + setClearColor(0x000000,0)) : la section
// garde le fond du site derrière.
//
// Intégration (voir Portfolio Tom Labourdette.dc.html → setupSkillsPlanet) :
//   import("./skills-planet.js").then(({ mountSkillsPlanet }) => {
//     const handle = mountSkillsPlanet(containerEl, { skills, colors, mobile });
//     // handle.dispose() / handle.setColors(colors) / handle.destroy()
//   });
// ============================================================================

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm";
import { CSS2DRenderer, CSS2DObject } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/renderers/CSS2DRenderer.js/+esm";

// ---- Liste par défaut des compétences en orbite : éditable ici -----------
// name    : libellé affiché sous l'icône
// icon    : chemin SVG (viewBox 0 0 24 24, même style que le reste du site)
// radius  : rayon de l'orbite (en unités de scène ; sphère = rayon 1.55)
// speed   : vitesse de révolution (radians / seconde)
// tilt    : inclinaison de l'orbite en degrés
export const SKILLS = [
  { name: "Excel avancé", icon: "M4 5h16v14H4zM4 10h16M9 5v14", radius: 2.5, speed: 0.22, tilt: 6 },
  { name: "Power BI", icon: "M5 19v-7M10 19V6M15 19V9M20 19v-4M3 21h18", radius: 2.9, speed: 0.16, tilt: -14 },
  { name: "Systèmes d'information", icon: "M4 4h16v10H4zM8 20h8M12 14v6", radius: 2.5, speed: -0.19, tilt: 22 },
  { name: "Analyse de données", icon: "M4 19h16M7 19V9m5 10V5m5 14v-7", radius: 3.2, speed: 0.14, tilt: -6 },
  { name: "IA appliquée", icon: "M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5zM7 13v2a5 5 0 0 0 10 0v-2", radius: 2.7, speed: -0.17, tilt: 34 },
  { name: "Lean / amélioration continue", icon: "M12 3v4M12 17v4M4.2 4.2l2.8 2.8M17 17l2.8 2.8M3 12h4M17 12h4M4.2 19.8L7 17M17 7l2.8-2.8", radius: 3.0, speed: 0.2, tilt: -28 },
  { name: "Palettisation", icon: "M3 17h18M3 17v-3h18v3M6 14V9h12v5M9 9V6h6v3", radius: 2.6, speed: 0.18, tilt: 12 },
  { name: "Continuité d'activité", icon: "M12 3l7 3v5c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6zM9 11.5l2 2l4-4", radius: 3.1, speed: -0.15, tilt: -20 }
];

const EARTH_TEX = {
  map: "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  normal: "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  specular: "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
  clouds: "https://threejs.org/examples/textures/planets/earth_clouds_1024.png"
};

function readThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || "").trim() || fallback;
  return {
    accent: pick("--accent", "#C7F24E"),
    text: pick("--text", "#F2F1EA"),
    panel: pick("--panel", "#14141C"),
    line: pick("--line", "rgba(255,255,255,0.2)")
  };
}

// Groups skills into 3 flat rings (fixed radius/speed/tilt per ring) so
// they stay evenly spaced and move at a constant, predictable pace —
// far more readable than independent random orbits.
function withPhases(skills) {
  const rings = [
    { radius: 2.9, speed: 0.14, tilt: 6, phaseOffset: 0 },
    { radius: 3.6, speed: -0.1, tilt: -12, phaseOffset: (Math.PI * 2) / 9 },
    { radius: 4.3, speed: 0.08, tilt: 18, phaseOffset: (Math.PI * 4) / 9 }
  ];
  const counts = [0, 0, 0];
  skills.forEach((_, i) => counts[i % 3]++);
  const seen = [0, 0, 0];
  return skills.map((s, i) => {
    const ringIdx = i % 3;
    const ring = rings[ringIdx];
    const n = counts[ringIdx] || 1;
    const k = seen[ringIdx]++;
    const phase = s.phase != null ? s.phase : ring.phaseOffset + (k / n) * Math.PI * 2;
    return {
      ...s,
      radius: s.radius != null ? s.radius : ring.radius,
      speed: s.speed != null ? s.speed : ring.speed,
      tilt: s.tilt != null ? s.tilt : ring.tilt,
      phase
    };
  });
}

export function mountSkillsPlanet(container, opts = {}) {
  const skillsSrc = opts.skills && opts.skills.length ? opts.skills : SKILLS;
  const isMobile = !!opts.mobile;
  const skills = withPhases(isMobile ? skillsSrc.slice(0, Math.min(6, skillsSrc.length)) : skillsSrc);
  let colors = opts.colors || readThemeColors();

  container.style.position = "relative";
  container.style.overflow = "hidden";

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute; inset:0; width:100%; height:100%; display:block;";
  container.appendChild(canvas);

  const labelLayer = document.createElement("div");
  labelLayer.style.cssText = "position:absolute; inset:0; pointer-events:none;";
  container.appendChild(labelLayer);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.cssText = "position:absolute; top:0; left:0; pointer-events:none;";
  labelLayer.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const CAMERA_DIST = 11.2, MAX_RING_RADIUS = 4.3;
  camera.position.set(0, 1.0, CAMERA_DIST);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(5, 3, 6);
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minPolarAngle = Math.PI * 0.28;
  controls.maxPolarAngle = Math.PI * 0.72;

  let idleTimer = null;
  const resumeAutoRotateAfterIdle = () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 3500);
  };
  controls.addEventListener("start", resumeAutoRotateAfterIdle);
  controls.addEventListener("end", resumeAutoRotateAfterIdle);

  // ---- Globe --------------------------------------------------------------
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = "anonymous";
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  const earthMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(2.7, 64, 64), earthMat);
  globeGroup.add(earth);

  loader.load(EARTH_TEX.map, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; earthMat.map = tex; earthMat.needsUpdate = true; });
  loader.load(EARTH_TEX.normal, (tex) => { earthMat.normalMap = tex; earthMat.normalScale = new THREE.Vector2(0.6, 0.6); earthMat.needsUpdate = true; }, undefined, () => {});
  loader.load(EARTH_TEX.specular, (tex) => { earthMat.specularMap = tex; earthMat.needsUpdate = true; }, undefined, () => {});

  // Thin cloud shell + accent-tinted atmosphere glow matching the site palette.
  const cloudMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(2.75, 64, 64), cloudMat);
  globeGroup.add(clouds);
  loader.load(EARTH_TEX.clouds, (tex) => { cloudMat.map = tex; cloudMat.needsUpdate = true; }, undefined, () => {});

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(2.95, 48, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent), transparent: true, opacity: 0.09, side: THREE.BackSide })
  );
  globeGroup.add(glow);

  // ---- Orbites de compétences ----------------------------------------------
  const orbitEntries = skills.map((s) => {
    const pivot = new THREE.Object3D();
    pivot.rotation.x = THREE.MathUtils.degToRad(s.tilt || 0);
    pivot.rotation.z = s.phase;
    scene.add(pivot);

    const ringGeo = new THREE.RingGeometry(s.radius - 0.004, s.radius + 0.004, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.line || "#ffffff"), transparent: true, opacity: 0.07, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(colors.accent) })
    );
    marker.position.set(s.radius, 0, 0);
    pivot.add(marker);

    const el = document.createElement("div");
    el.style.cssText =
      "pointer-events:auto; display:flex; flex-direction:column; align-items:center; gap:4px; " +
      "transition:transform .25s cubic-bezier(.2,.7,.2,1), opacity .25s, filter .3s; cursor:default;";
    el.innerHTML =
      '<span style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      "background:" + colors.panel + ";border:1px solid " + colors.line + ';">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="' + colors.accent + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + s.icon + '"></path></svg></span>' +
      '<span style="font-family:\'Space Mono\',monospace; font-size:10px; letter-spacing:.3px; white-space:nowrap; ' +
      "color:" + colors.text + '; text-shadow:0 2px 6px rgba(0,0,0,.6); opacity:.85; transition:opacity .3s, color .3s;">' + s.name + "</span>";
    const label = new CSS2DObject(el);
    label.position.copy(marker.position);
    pivot.add(label);

    let hovered = false;
    el.addEventListener("mouseenter", () => { hovered = true; });
    el.addEventListener("mouseleave", () => { hovered = false; });

    return { pivot, marker, el, speed: s.speed, get hovered() { return hovered; } };
  });

  // Depth cue + screen-space collision avoidance: labels nearer the camera
  // render larger/opaque; AND each frame, among labels that are still visually
  // prominent, any one whose projected screen position lands within minDist
  // of a closer label already accepted is forcibly suppressed (shrunk+faded).
  // This is what actually prevents two front-facing labels from different
  // rings from ever rendering text on top of each other, regardless of depth.
  const zNear = -(CAMERA_DIST - MAX_RING_RADIUS), zFar = -(CAMERA_DIST + MAX_RING_RADIUS);
  const tmpWorld = new THREE.Vector3(), tmpProj = new THREE.Vector3(), tmpLocal = new THREE.Vector3();
  const MIN_LABEL_DIST_PX = 76;
  function updateLabelDepths() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const items = orbitEntries.map((o) => {
      o.marker.getWorldPosition(tmpWorld);
      tmpLocal.copy(tmpWorld).applyMatrix4(camera.matrixWorldInverse);
      let f = (tmpLocal.z - zFar) / (zNear - zFar);
      f = Math.max(0, Math.min(1, f));
      tmpProj.copy(tmpWorld).project(camera);
      const x = (tmpProj.x + 1) / 2 * w, y = (1 - tmpProj.y) / 2 * h;
      return { o, f, x, y };
    });
    // Nearest-first so closer labels win any collision against farther ones.
    items.sort((a, b) => b.f - a.f);
    const placed = [];
    items.forEach((it) => {
      const collides = !it.o.hovered && placed.some((p) => {
        const dx = p.x - it.x, dy = p.y - it.y;
        return Math.sqrt(dx * dx + dy * dy) < MIN_LABEL_DIST_PX;
      });
      placed.push(it);
      const o = it.o, f = it.f;
      const scale = o.hovered ? 1.35 : collides ? 0.4 : (0.5 + f * 0.7);
      const opacity = o.hovered ? 1 : collides ? 0.12 : (0.2 + f * 0.8);
      o.el.style.transform = "translate(-50%,-130%) scale(" + scale.toFixed(3) + ")";
      o.el.style.opacity = opacity.toFixed(3);
      o.el.style.zIndex = String(Math.round(f * 1000) + (o.hovered ? 2000 : 0));
      const lastEl = o.el.lastChild;
      if (o.hovered) { o.el.style.filter = "drop-shadow(0 0 10px " + colors.accent + ")"; if (lastEl) { lastEl.style.color = colors.accent; lastEl.style.opacity = "1"; } }
      else { o.el.style.filter = "none"; if (lastEl) { lastEl.style.color = colors.text; lastEl.style.opacity = ".85"; } }
    });
  }

  // ---- Boucle de rendu (pause hors viewport) -------------------------------
  let running = false, raf = null, lastT = performance.now();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    earth.rotation.y += dt * 0.045;
    clouds.rotation.y += dt * 0.06;
    orbitEntries.forEach((o) => {
      const mul = o.hovered ? 0.15 : 1;
      o.pivot.rotation.z += o.speed * dt * mul;
    });
    controls.update();
    camera.updateMatrixWorld();
    updateLabelDepths();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  function start() { if (!running) { running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
  }
  resize();
  start();

  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) start(); else stop(); });
  }, { threshold: 0.05 });
  io.observe(container);

  function setColors(next) {
    colors = { ...colors, ...next };
    glow.material.color.set(colors.accent);
    orbitEntries.forEach((o) => {
      const ring = o.pivot.children.find((c) => c.geometry && c.geometry.type === "RingGeometry");
      if (ring) ring.material.color.set(colors.line);
      const marker = o.pivot.children.find((c) => c.geometry && c.geometry.type === "SphereGeometry");
      if (marker) marker.material.color.set(colors.accent);
      const label = o.pivot.children.find((c) => c.isCSS2DObject);
      if (label) {
        const el = label.element;
        const badge = el.firstChild, txt = el.lastChild;
        if (badge) { badge.style.background = colors.panel; badge.style.border = "1px solid " + colors.line; }
        if (txt) txt.style.color = colors.text;
        const svg = el.querySelector("svg");
        if (svg) svg.setAttribute("stroke", colors.accent);
      }
    });
  }

  function destroy() {
    stop();
    ro.disconnect();
    io.disconnect();
    controls.dispose();
    renderer.dispose();
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    container.innerHTML = "";
  }

  return { setColors, destroy, dispose: destroy, pause: stop, resume: start };
}
