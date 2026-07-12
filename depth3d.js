/* ============================================================
   DEPTH 3D PORTRAIT
   Ported from flo-bit's svelte-depth-3d-component to vanilla Three.js.
   A subdivided plane whose vertices are pushed along Z by a depth map,
   textured with the photo, tilting toward the mouse.
   ============================================================ */
import * as THREE from 'three';

const canvas = document.getElementById('depthCanvas');
if (canvas) {
  const wrap = canvas.parentElement;

  // --- tweakables ---------------------------------------------------
  const IMAGE      = './img/profilepic.png';        // your photo
  const DEPTH      = './img/profilepic-depth.png';  // the depth map
  const DEPTH_SCALE   = 1.6;   // how much 3D "pop" (higher = more extreme)
  const DETAIL        = 220;   // plane subdivisions (higher = smoother warp)
  const ROTATION_SCALE= 0.45;  // how far it tilts toward the cursor
  const EASE          = 0.06;  // tilt smoothing (lower = floatier)
  // ------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const loader = new THREE.TextureLoader();

  // load both textures, then build the mesh
  Promise.all([
    new Promise((res, rej) => loader.load(IMAGE, res, undefined, rej)),
    new Promise((res, rej) => loader.load(DEPTH, res, undefined, rej)),
  ]).then(([map, depthMap]) => {
    map.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTexture:  { value: map },
        uDepthMap: { value: depthMap },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform sampler2D uDepthMap;
        void main(){
          vUv = uv;
          // push the vertex toward the camera based on the depth map
          float depth = texture2D(uDepthMap, vUv).r;
          vec3 newPosition = position + vec3(0.0, 0.0, depth * ${DEPTH_SCALE.toFixed(2)});
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        void main(){
          vec4 c = texture2D(uTexture, vUv);
          c.rgb *= 1.4;              // brightness — bump this up/down
          c.rgb = (c.rgb - 0.5) * 0.7 + 0.5;    // contrast
          gl_FragColor = c;
        }`,
    });

    // aspect-correct plane sized to the photo
    const iw = map.image.width, ih = map.image.height;
    const imgAspect = iw / ih;
    const H = 7, W = H * imgAspect;
    const geometry = new THREE.PlaneGeometry(W, H, DETAIL, DETAIL);

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // frame the plane so it fills the canvas
    function resize(){
      const w = wrap.clientWidth || 400, h = wrap.clientHeight || 500;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // pull the camera back far enough that the plane covers the frame
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const distH = (H / 2) / Math.tan(vFov / 2);
      const hFov  = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const distW = (W / 2) / Math.tan(hFov / 2);
      camera.position.z = Math.min(distH, distW) + DEPTH_SCALE + 0.5;
      camera.updateProjectionMatrix();
    }
    resize();
    addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

    // mouse tilt (relative to the photo, eased)
    let tx = 0, ty = 0, cx = 0, cy = 0;
    wrap.addEventListener('pointermove', e => {
      const r = wrap.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width  - 0.5) * 2;   // -1..1
      ty = ((e.clientY - r.top ) / r.height - 0.5) * 2;
    });
    wrap.addEventListener('pointerleave', () => { tx = 0; ty = 0; });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function loop(){
      requestAnimationFrame(loop);
      if (!reduced){
        cx += (tx - cx) * EASE;
        cy += (ty - cy) * EASE;
      }
      mesh.rotation.y =  cx * ROTATION_SCALE;
      mesh.rotation.x =  cy * ROTATION_SCALE;
      renderer.render(scene, camera);
    })();
  }).catch(err => {
    console.warn('depth3d: could not load images', err);
    // graceful fallback: show the flat photo so the section never looks broken
    if (wrap) {
      wrap.innerHTML = `<img src="${IMAGE}" alt="Augusto Segura"
        style="width:100%;height:100%;object-fit:cover;display:block">`;
    }
  });
}
