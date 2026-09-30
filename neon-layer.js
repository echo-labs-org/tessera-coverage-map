// NEON terrestrial sites overlay.
//
// index.html is regenerated from geotessera's globe.html by CI, so this layer
// lives in its own file and is hooked in by the "Add NEON sites layer" step
// in .github/workflows/map.yml (which exposes `window.globe` and appends a
// <script> tag for this module).
//
// The sites are rasterised onto a canvas covering just their bounding box and
// mapped onto a partial sphere sitting above the coverage overlays (below the
// country borders), far sharper than a full-globe texture would be. Hidden
// until toggled on.
import * as THREE from 'three';

const GEOJSON_URL = 'NEON%20terrestrial%20sites.geojson';
const RADIUS = 100.4;        // Above the coverage overlays (100.3)
const PAD_DEG = 1;           // Margin around the sites' bounding box
const MAX_TEXTURE_PX = 4096; // Safe texture size on most GPUs, incl. mobile
const FILL = 'rgba(224, 64, 251, 0.45)';
const STROKE = 'rgb(234, 128, 252)';

function polygonsOf(geometry) {
    if (geometry.type === 'Polygon') return [geometry.coordinates];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates;
    return [];
}

function boundingBox(polygons) {
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const polygon of polygons) {
        for (const [lon, lat] of polygon[0]) {
            if (lon < lonMin) lonMin = lon;
            if (lon > lonMax) lonMax = lon;
            if (lat < latMin) latMin = lat;
            if (lat > latMax) latMax = lat;
        }
    }
    return {
        lonMin: Math.max(-180, lonMin - PAD_DEG),
        lonMax: Math.min(180, lonMax + PAD_DEG),
        latMin: Math.max(-90, latMin - PAD_DEG),
        latMax: Math.min(90, latMax + PAD_DEG),
    };
}

function drawSites(polygons, bbox) {
    const lonSpan = bbox.lonMax - bbox.lonMin;
    const latSpan = bbox.latMax - bbox.latMin;
    // Equirectangular within the bbox, longest side at MAX_TEXTURE_PX.
    const scale = MAX_TEXTURE_PX / Math.max(lonSpan, latSpan);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(lonSpan * scale);
    canvas.height = Math.ceil(latSpan * scale);
    const ctx = canvas.getContext('2d');

    const toPx = ([lon, lat]) => [(lon - bbox.lonMin) * scale, (bbox.latMax - lat) * scale];

    ctx.beginPath();
    for (const polygon of polygons) {
        for (const ring of polygon) {
            ring.forEach((coord, i) => {
                const [x, y] = toPx(coord);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.closePath();
        }
    }
    ctx.fillStyle = FILL;
    ctx.fill('evenodd');
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();
    return canvas;
}

function createMesh(canvas, bbox) {
    const deg = Math.PI / 180;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    // SphereGeometry's phi runs from lon -180 once rotated like the coverage
    // overlays (rotation.y = 4.71), and theta from the north pole.
    const geometry = new THREE.SphereGeometry(
        RADIUS, 128, 64,
        (bbox.lonMin + 180) * deg, (bbox.lonMax - bbox.lonMin) * deg,
        (90 - bbox.latMax) * deg, (bbox.latMax - bbox.latMin) * deg,
    );
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'neonSitesOverlay';
    mesh.renderOrder = 100; // After the coverage overlays (1..N)
    mesh.visible = false;
    mesh.rotation.y = 4.71;
    return mesh;
}

function addToggle(mesh) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" id="showNeonSites">
        <span style="color:${STROKE};">■</span> Show NEON terrestrial sites`;
    label.querySelector('input').addEventListener('change', (e) => {
        mesh.visible = e.target.checked;
    });
    document.querySelector('.controls').appendChild(label);
}

async function init() {
    const globe = window.globe;
    if (!globe) {
        console.warn('NEON layer: window.globe not found; skipping');
        return;
    }
    const response = await fetch(GEOJSON_URL);
    if (!response.ok) {
        console.warn(`NEON layer: could not load ${GEOJSON_URL}`);
        return;
    }
    const geojson = await response.json();
    const polygons = geojson.features.flatMap(f => polygonsOf(f.geometry));
    if (!polygons.length) return;

    const bbox = boundingBox(polygons);
    const mesh = createMesh(drawSites(polygons, bbox), bbox);
    globe.scene().add(mesh);
    addToggle(mesh);
    console.log(`NEON layer: ${polygons.length} site polygons`);
}

init().catch(e => console.warn(`NEON layer failed: ${e.message}`));
