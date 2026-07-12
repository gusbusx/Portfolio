import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const canvas = document.getElementById('scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, 0.1, 20000);
camera.position.set(0, 0, 60);

/* ---------------- SPACE BACKDROP---------------- */
// big gradient nebula sphere we sit inside
const nebulaUniforms = {
  uTime:{value:0},
  uColorA:{value:new THREE.Color(0x050507)}, 
  uColorB:{value:new THREE.Color(0x0a0a0e)}, 
  uColorC:{value:new THREE.Color(0x000000)},  
};
const nebula = new THREE.Mesh(
  new THREE.SphereGeometry(9000, 32, 32),
  new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:nebulaUniforms,
    vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`
      varying vec3 vP; uniform float uTime; uniform vec3 uColorA,uColorB,uColorC;
      // cheap value noise
      float hash(vec3 p){ return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5); }
      float noise(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        float n=mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        return n;}
      void main(){
        vec3 dir=normalize(vP);
        float n=noise(dir*3.0+vec3(0.0,uTime*0.02,0.0));
        n+=0.5*noise(dir*7.0-vec3(uTime*0.03,0.0,0.0));
        vec3 col=mix(uColorB,uColorA,smoothstep(0.2,0.8,n));
        col=mix(col,uColorC,smoothstep(0.55,1.0,noise(dir*2.0+10.0))*0.6);
        // vignette toward bottom brighter (aurora glow handled separately)
        gl_FragColor=vec4(col,1.0);
      }`
  })
);
scene.add(nebula);

// AURORA — soft glowing ribbons low in the scene
const auroraUniforms={ uTime:{value:0} };
const aurora=new THREE.Mesh(
  new THREE.PlaneGeometry(9000,3500,1,1),
  new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide, blending:THREE.AdditiveBlending,
    uniforms:auroraUniforms,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader:`
      varying vec2 vUv; uniform float uTime;
      void main(){
        float x=vUv.x, y=vUv.y;
        float wave=sin(x*10.0+uTime*0.6)*0.06 + sin(x*20.0-uTime*0.4)*0.03;
        float band=smoothstep(0.5,0.5+0.28,y+wave)-smoothstep(0.5+0.28,0.5+0.55,y+wave);
        vec3 green=vec3(0.20,0.95,0.65), teal=vec3(0.15,0.80,0.95), violet=vec3(0.55,0.45,0.95);
        vec3 col=mix(green,teal,sin(x*6.0+uTime*0.3)*0.5+0.5);
        col=mix(col,violet,smoothstep(0.7,1.0,x));
        float alpha=band*0.5*smoothstep(0.0,0.25,y);
        gl_FragColor=vec4(col,alpha);
      }`
  })
);
aurora.position.set(0,-1400,-3000); aurora.rotation.x=-0.35;

// STARS with per-star flicker
const STAR_N=10000;
const starGeo=new THREE.BufferGeometry();
const sPos=new Float32Array(STAR_N*3), sPhase=new Float32Array(STAR_N), sSize=new Float32Array(STAR_N);
for(let i=0;i<STAR_N;i++){
  // distribute on a large shell
  const r=4000+Math.random()*3500;
  const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
  sPos[i*3]=r*Math.sin(ph)*Math.cos(th);
  sPos[i*3+1]=r*Math.cos(ph);
  sPos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
  sPhase[i]=Math.random()*Math.PI*2;
  sSize[i]=40.0+Math.random()*40.0;
}
starGeo.setAttribute('position',new THREE.BufferAttribute(sPos,3));
starGeo.setAttribute('aPhase',new THREE.BufferAttribute(sPhase,1));
starGeo.setAttribute('aSize',new THREE.BufferAttribute(sSize,1));
const starMat=new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  uniforms:{ uTime:{value:0}, uPixelRatio:{value:Math.min(devicePixelRatio,1.75)} },
  vertexShader:`
    attribute float aPhase; attribute float aSize; uniform float uTime; uniform float uPixelRatio;
    varying float vTw;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.0);
      float tw=0.5+0.5*sin(uTime*2.5+aPhase);   // flicker
      vTw=tw;
      gl_PointSize=aSize*(1.0+tw*0.8)*uPixelRatio*(300.0/-mv.z);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader:`
    varying float vTw;
    void main(){
      vec2 c=gl_PointCoord-0.5; float d=length(c);
      float a=smoothstep(0.5,0.0,d)*(0.6+vTw*0.9);
      vec3 col=mix(vec3(0.7,0.85,1.0),vec3(1.0),vTw);
      gl_FragColor=vec4(col,a);
    }`
});
const stars=new THREE.Points(starGeo,starMat); scene.add(stars);

// --- smoke nebula clouds (flo-bit style, dark palette) ---
(function(){
  // build a soft round smoke puff texture in code (no file needed)
  const cvs=document.createElement('canvas'); cvs.width=cvs.height=256;
  const cx=cvs.getContext('2d');
  const grd=cx.createRadialGradient(128,128,0,128,128,128);
  grd.addColorStop(0,'rgba(255,255,255,0.9)');
  grd.addColorStop(0.4,'rgba(255,255,255,0.35)');
  grd.addColorStop(1,'rgba(255,255,255,0)');
  cx.fillStyle=grd; cx.fillRect(0,0,256,256);
  const smokeTex=new THREE.CanvasTexture(cvs);

  // dark, moody palette (charcoal / faint slate — barely-there color)
  const cols=[0x111318, 0x1a1d24, 0x0c0e12, 0x22252e, 0x15171c];
  const cloudGroup=new THREE.Group();
  for(let i=0;i<26;i++){
    const m=new THREE.Mesh(
      new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({ map:smokeTex, transparent:true, opacity:0.35,
        depthWrite:false, blending:THREE.AdditiveBlending,
        color:cols[Math.floor(Math.random()*cols.length)] })
    );
    m.position.set((Math.random()*2200-1100), (Math.random()*1200-400), -1400-Math.random()*900);
    m.rotation.z=Math.random()*Math.PI*2;
    const s=300+Math.random()*700; m.scale.set(s,s,1);
    cloudGroup.add(m);
  }
  scene.add(cloudGroup);
  window.__clouds=cloudGroup; // so it can follow the camera
})();

/* ---------------- LIGHTS ---------------- */
const amb=new THREE.AmbientLight(0x6070a0,1.4); scene.add(amb);
const key=new THREE.DirectionalLight(0xfff4e0,2.6); key.position.set(5,3,6); scene.add(key);
const rim=new THREE.DirectionalLight(0x4ade80,0.7); rim.position.set(-5,-1,-4); scene.add(rim);

const rim2=new THREE.DirectionalLight(0x22d3ee,0.6); rim2.position.set(-6,2,3); scene.add(rim2);
const fillP=new THREE.PointLight(0x22d3ee,0.7,0); fillP.position.set(0,10,30); scene.add(fillP);

/* ---------------- MODEL LOADING ---------------- */
const draco=new DRACOLoader(); draco.setDecoderPath('./vendor/draco/');
const loader=new GLTFLoader(); loader.setDRACOLoader(draco);
const pctEl=document.getElementById('pct'), loaderEl=document.getElementById('loader');

const worlds={}; // holds {group, size} per model
function normalize(obj, targetSize){
  const box=new THREE.Box3().setFromObject(obj);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z)||1;
  const s=targetSize/maxDim;
  const g=new THREE.Group();
  obj.position.sub(center);        // center at origin
  obj.scale.setScalar(s);
  g.add(obj);
  return { group:g, scaledSize:size.clone().multiplyScalar(s), inner:obj };
}

function loadOne(url){ return new Promise((res,rej)=>loader.load(url,res,undefined,rej)); }

let mixer=null; // for earth animation
async function loadAll(){
  const [earthG, wtcG, cityG] = await Promise.all([
    loadOne('./models/earth.glb'),
    loadOne('./models/one_wtc.glb'),
    loadOne('./models/cyberpunk_city.glb'),
  ]).catch(e=>{ console.error(e); throw e; });

  // EARTH
  worlds.earth=normalize(earthG.scene, 40);
  const maxAniso=renderer.capabilities.getMaxAnisotropy();
  worlds.earth.inner.traverse(o=>{ if(o.isMesh&&o.material){
    const arr=Array.isArray(o.material)?o.material:[o.material];
    arr.forEach(m=>{
      // crisp textures
      ['map','emissiveMap','normalMap','roughnessMap','metalnessMap','specularMap'].forEach(key=>{
        if(m[key]){ m[key].anisotropy=maxAniso; m[key].needsUpdate=true; }
      });
      if('emissive' in m && m.emissiveIntensity!==undefined){ m.emissiveIntensity=Math.max(m.emissiveIntensity,0.25);} 
      if('roughness' in m){m.roughness=Math.min(1,(m.roughness??0.9));}
      if('metalness' in m){m.metalness=Math.min(0.2,(m.metalness??0));}
      m.needsUpdate=true;
    });
  }});
  worlds.earth.group.visible=true;
  scene.add(worlds.earth.group);
  if(earthG.animations && earthG.animations.length){
    mixer=new THREE.AnimationMixer(earthG.scene);
    mixer.clipAction(earthG.animations[0]).play();
  }

  // ONE WORLD TRADE
  worlds.wtc=normalize(wtcG.scene, 120);
  // sit its base near y=0 (normalize centered it, so shift up by half height)
  worlds.wtc.inner.position.y += worlds.wtc.scaledSize.y*0.5;
  worlds.wtc.group.visible=false;
  scene.add(worlds.wtc.group);

  // CYBERPUNK CITY
  worlds.city=normalize(cityG.scene, 300);
  worlds.city.group.visible=false;
  // warm up its emissive so neon reads at night
  worlds.city.inner.traverse(o=>{ if(o.isMesh&&o.material){
    const arr=Array.isArray(o.material)?o.material:[o.material];
    arr.forEach(m=>{ if(m.emissive){ m.emissiveIntensity=Math.max(m.emissiveIntensity||0,0.8);} m.toneMapped=true; });
  }});
  scene.add(worlds.city.group);
  loaderEl.classList.add('hide');
  buildPoses();
  animate();
}

// progress across all three files
const totals={}; const loaded={};
const _load=loader.load.bind(loader);
loader.load=function(url,onload,onprog,onerr){
  return _load(url,onload,(xhr)=>{ if(xhr.total){totals[url]=xhr.total;loaded[url]=xhr.loaded;
    const t=Object.values(totals).reduce((a,b)=>a+b,0), l=Object.values(loaded).reduce((a,b)=>a+b,0);
    if(t) pctEl.textContent=Math.round(l/t*100)+'%'; } onprog&&onprog(xhr); },onerr);
};

loadAll().catch(()=>{ document.querySelector('#loader .lbl').textContent='Could not load models'; pctEl.textContent='check models/ + vendor/draco'; });

/* ---------------- SCROLL JOURNEY (fixed poses) ----------------
   One continuous scroll value s in [0..4] across the 5 sections.
   Each integer stop has a fixed camera pose + which world is shown.
   We interpolate poses between stops so the camera only makes the
   deliberate moves you asked for:
     0 home    : earth, framed left, "Gus" on the right
     -> zoom INTO earth as you approach about
     1 about   : One World Trade, fixed low upward-looking angle (screenshot)
     2 projects: Times Square / cyberpunk streets, at the red stairs
     3 work    : driving down the road (slow forward push)
     -> zoom back OUT
     4 contact : earth again, pulled back
------------------------------------------------------------------ */
const sections=['home','about','projects','work','contact'].map(id=>document.getElementById(id));

// scroll position expressed in "section units" (0..4)
function scrollUnits(){
  // use each section's center in document space vs the viewport center in doc space
  const vcDoc = scrollY + innerHeight/2;
  const centers = sections.map(el=>{
    const r=el.getBoundingClientRect();
    return scrollY + r.top + r.height/2;   // section center in document coords
  });
  if(vcDoc<=centers[0]) return 0;
  if(vcDoc>=centers[centers.length-1]) return centers.length-1;
  for(let i=0;i<centers.length-1;i++){
    if(vcDoc>=centers[i] && vcDoc<=centers[i+1]){
      const t=(vcDoc-centers[i])/((centers[i+1]-centers[i])||1);
      return i+Math.max(0,Math.min(1,t));
    }
  }
  return 0;
}

// world shown per section index
const WORLD_BY_STOP=['earth','wtc','city','city','earth'];
function showOnly(name){ ['earth','wtc','city'].forEach(k=>{ if(worlds[k]) worlds[k].group.visible=(k===name); }); }

// pose definitions filled once sizes are known
let POSES=null;
function buildPoses(){
  const eH=worlds.earth?worlds.earth.scaledSize.y:40;
  const wH=worlds.wtc?worlds.wtc.scaledSize.y:120;
  const S=worlds.city?worlds.city.scaledSize:{x:300,y:200,z:160};
  const R=Math.max(S.x,S.z);
  POSES=[
    // 0 HOME — earth on the right, camera pulled back
    { world:'earth', pos:[-24, 3, 60], look:[-20, 0, 0] },
    // 1 ABOUT — One World Trade: low, near base, looking UP the tower
    { world:'wtc',   pos:[0, 15, 10], look:[0, 56, -13] },
    // 2 PROJECTS — Times Square skyline
    { world:'city',  pos:[172, -3, 0], look:[0, 0, 0] },
    // 3 WORK — city angle
    { world:'city',  pos:[-135, 3, 0], look:[0, 0, 0] },
    // 4 CONTACT — earth again, pulled further back
    { world:'earth', pos:[10, 6, 96], look:[0,0,0] },
  ];
  window.POSES=POSES;
}

// ---- day/night sky presets, one per section (0..4) ----
// sun: 0=hidden (night), 1=full. sunCol: the sun/light tint.
const SKIES = [
  { bg:0x050507, ambient:0x6070a0, ai:1.4, key:0xfff4e0, ki:2.6, exposure:1.15, stars:1.0, sun:0.0, sunCol:0xffffff }, // 0 home night
  { bg:0x93c9ff, ambient:0xcfe4ff, ai:2.8, key:0xffffff, ki:4.6, exposure:1.55, stars:0.0, sun:1.0, sunCol:0xffffff }, // 1 about DAY
  { bg:0xff7a3d, ambient:0xffb27a, ai:2.2, key:0xffd0a0, ki:3.0, exposure:1.35, stars:0.0, sun:1.0, sunCol:0xffd08a }, // 2 projects SUNSET
  { bg:0xe85a4f, ambient:0xffa080, ai:2.0, key:0xffc090, ki:2.8, exposure:1.3, stars:0.0, sun:1.0, sunCol:0xffb070 },  // 3 work SUNSET
  { bg:0x050507, ambient:0x6070a0, ai:1.4, key:0xfff4e0, ki:2.6, exposure:1.15, stars:1.0, sun:0.0, sunCol:0xffffff }, // 4 contact night
];
const _tmpA=new THREE.Color(), _tmpB=new THREE.Color();
function lerpNum(a,b,t){ return a+(b-a)*t; }
function applySky(s){
  const i=Math.max(0,Math.min(SKIES.length-2,Math.floor(s)));
  let f=s-i; f=Math.max(0,Math.min(1,f));
  const A=SKIES[i], B=SKIES[i+1];
  // home(0) -> about(1): pass through a sunrise/sunset color at the midpoint
  if(i===0){
    const SUNRISE = 0xff7a3d;
    if(f < 0.65){
      // night -> sunrise (slow, takes up most of the scroll)
      scene.background=_tmpA.set(A.bg).clone().lerp(_tmpB.set(SUNRISE), f/0.65);
    } else {
      // sunrise -> day (quick, at the very end)
      scene.background=_tmpA.set(SUNRISE).clone().lerp(_tmpB.set(B.bg), (f-0.65)/0.35);
    }
  } else {
    scene.background=_tmpA.set(A.bg).clone().lerp(_tmpB.set(B.bg),f);
  }
  amb.color.copy(_tmpA.set(A.ambient)).lerp(_tmpB.set(B.ambient),f);
  amb.intensity=lerpNum(A.ai,B.ai,f);
  if(i===0){
    const SUN_WARM = 0xffb070;
    if(f < 0.65) key.color.copy(_tmpA.set(A.key)).lerp(_tmpB.set(SUN_WARM), f/0.65);
    else         key.color.copy(_tmpA.set(SUN_WARM)).lerp(_tmpB.set(B.key), (f-0.65)/0.35);
  } else {
    key.color.copy(_tmpA.set(A.key)).lerp(_tmpB.set(B.key),f);
  }
  key.intensity=lerpNum(A.ki,B.ki,f);
  renderer.toneMappingExposure=lerpNum(A.exposure,B.exposure,f);
  const starVis=lerpNum(A.stars,B.stars,f);
  stars.material.opacity=starVis;
  nebula.visible = starVis>0.6;
  if(window.__clouds) window.__clouds.visible = starVis>0.15;
  // sun fade + tint
  if(window.__sun){
    const sv=lerpNum(A.sun,B.sun,f);
    _tmpA.set(A.sunCol); _tmpB.set(B.sunCol); _tmpA.lerp(_tmpB,f);
    window.__sun.sunMat.opacity=sv;
    window.__sun.sunMat.color.copy(_tmpA);
    window.__sun.sunGlow.material.opacity=sv*0.5;
    window.__sun.sunLight.intensity=sv*2.2;
    window.__sun.sunLight.color.copy(_tmpA);
  }
}

// extra "zoom into earth" push that happens between home(0) and about(1)
function lerp3(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function easeInOut(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}

let cur={pos:[-14,3,62],look:[-14,0,0]};


function updateCamera(){
  if(!POSES) return;
  const s=scrollUnits();               // 0..4
  const i=Math.max(0,Math.min(POSES.length-2,Math.floor(s)));
  let f=s-i; f=easeInOut(Math.max(0,Math.min(1,f)));

  let A=POSES[i], B=POSES[i+1];
  let pos=lerp3(A.pos,B.pos,f);
  let look=lerp3(A.look,B.look,f);

  // Segment 0->1: add an extra zoom INTO the earth before the tower appears
 // if(i===0){
    // push toward the globe as we leave home
  //  const zoom=easeInOut(f);
  //  pos=[ lerp3(A.pos,[ -6, 1, 30],1)[0]*zoom + A.pos[0]*(1-zoom),
  //        A.pos[1]+(1-A.pos[1])*zoom*0.6,
   //       A.pos[2]-(A.pos[2]-24)*zoom ];
   // look=[A.look[0]*(1-zoom), A.look[1], A.look[2]];
  //}

  // which world is visible: snap at the midpoint of each segment
  const stop=Math.round(s);
  showOnly(WORLD_BY_STOP[Math.max(0,Math.min(4,stop))]);

  // ---- TUNER OVERRIDE: if the dev panel is active, force its section + pose ----
  if(window.__tuner && window.__tuner.on){
    const T=window.__tuner;
    showOnly(WORLD_BY_STOP[Math.min(4,T.section)]);
    pos=[T.px,T.py,T.pz]; look=[T.lx,T.ly,T.lz];
  }

  // ---- PROJECT DETAIL VIEW: fly to a project's custom pose ----
  if(window.__detail && window.__detail.on){
    showOnly('city');
    pos=window.__detail.pos; look=window.__detail.look;
  }

  cur.tpos=pos; cur.tlook=look;
}

/* ---------------- RENDER LOOP ---------------- */
const clock=new THREE.Clock();
let mx=0,my=0,cmx=0,cmy=0;
addEventListener('mousemove',e=>{mx=e.clientX/innerWidth-0.5;my=e.clientY/innerHeight-0.5;});

function animate(){
  requestAnimationFrame(animate);
  const dt=clock.getDelta(), t=clock.elapsedTime;
  if(mixer && !reduced) mixer.update(dt);
  nebulaUniforms.uTime.value=t;
  auroraUniforms.uTime.value=t;
  starMat.uniforms.uTime.value=t;
  if(!reduced){ stars.rotation.y=t*0.003; if(worlds.earth) worlds.earth.inner.rotation.y += dt*0.04; }

  updateCamera();
  applySky(scrollUnits());
  
  // smooth toward target pose (camera itself is otherwise fixed per section)
  cmx+=(mx-cmx)*0.04; cmy+=(my-cmy)*0.04;
  const k=(window.__tuner&&window.__tuner.on)?1:0.07;   // instant while tuning
  if(cur.tpos){
    cur.pos[0]+=(cur.tpos[0]-cur.pos[0])*k; cur.pos[1]+=(cur.tpos[1]-cur.pos[1])*k; cur.pos[2]+=(cur.tpos[2]-cur.pos[2])*k;
    cur.look[0]+=(cur.tlook[0]-cur.look[0])*k; cur.look[1]+=(cur.tlook[1]-cur.look[1])*k; cur.look[2]+=(cur.tlook[2]-cur.look[2])*k;
  }
  // very subtle pointer parallax (kept small so it feels "fixed")
  const par=2.5;
  camera.position.set(cur.pos[0]+cmx*par, cur.pos[1]-cmy*par*0.4, cur.pos[2]);
  camera.lookAt(cur.look[0],cur.look[1],cur.look[2]);

  nebula.position.copy(camera.position);
  if(window.__clouds) window.__clouds.position.copy(camera.position);
  renderer.render(scene,camera);
}

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  starMat.uniforms.uPixelRatio.value=Math.min(devicePixelRatio,1.75);
});

/* ---- PROJECT DETAIL camera API (called from index.html) ---- */
window.__detail={on:false, pos:[0,0,60], look:[0,0,0]};
window.flyToDetail=function(pose){
  window.__detail.pos=pose.pos.slice();
  window.__detail.look=pose.look.slice();
  window.__detail.on=true;
};
window.exitDetail=function(){ window.__detail.on=false; };

/* ============================================================
   LIVE CAMERA TUNER  (press "T" to toggle)
   Pick a section, drag the sliders, watch the camera move live,
   then hit Copy to get the exact POSES line to paste in.
   ============================================================ */
(function(){
  const NAMES=['0 HOME (earth)','1 ABOUT (wtc)','2 PROJECTS (city)','3 WORK (city)','4 CONTACT (earth)'];
  window.__tuner={on:false, section:0, px:-24,py:3,pz:60, lx:-20,ly:0,lz:0};
  const T=window.__tuner;

  const panel=document.createElement('div');
  panel.style.cssText=`position:fixed;top:70px;right:16px;z-index:9999;width:290px;
    background:rgba(10,12,20,.92);border:1px solid rgba(255,255,255,.15);border-radius:14px;
    padding:14px 16px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#dfe6f2;
    backdrop-filter:blur(10px);display:none;box-shadow:0 10px 40px rgba(0,0,0,.5)`;
  panel.innerHTML=`
    <div style="font-weight:700;margin-bottom:8px;letter-spacing:.04em">🎥 CAMERA TUNER <span style="float:right;opacity:.5;font-weight:400">press T</span></div>
    <label style="display:block;margin-bottom:8px">Section
      <select id="tSec" style="width:100%;margin-top:4px;background:#161b28;color:#fff;border:1px solid #333;border-radius:6px;padding:5px">
        ${NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join('')}
      </select>
    </label>
    ${['px','py','pz','lx','ly','lz'].map(k=>{
      const isPos=k[0]==='p'; const axis=k[1].toUpperCase();
      const lbl=(isPos?'cam ':'look ')+axis;
      return `<div style="margin:6px 0">
        <div style="display:flex;justify-content:space-between"><span>${lbl}</span><span id="v_${k}">0</span></div>
        <input id="s_${k}" type="range" min="-400" max="400" step="1" value="0" style="width:100%">
      </div>`;
    }).join('')}
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="tCopy" style="flex:1;background:#22d3ee;color:#04121a;border:0;border-radius:7px;padding:8px;font-weight:700;cursor:pointer">Copy line</button>
      <button id="tGoto" style="background:#333a4d;color:#fff;border:0;border-radius:7px;padding:8px 10px;cursor:pointer" title="scroll to this section">Go</button>
    </div>
    <div id="tOut" style="margin-top:8px;font-size:10px;color:#7fe;word-break:break-all;line-height:1.4"></div>
    <div style="margin-top:8px;font-size:10px;opacity:.55">Range too small? Type a number in the box beside a slider.</div>
  `;
  document.body.appendChild(panel);

  const sel=panel.querySelector('#tSec');
  const keys=['px','py','pz','lx','ly','lz'];
  const sliders={}, vals={};
  keys.forEach(k=>{ sliders[k]=panel.querySelector('#s_'+k); vals[k]=panel.querySelector('#v_'+k);
    // allow typing exact numbers: double-click the value to prompt
    vals[k].style.cursor='pointer'; vals[k].title='double-click to type exact value';
    vals[k].addEventListener('dblclick',()=>{ const n=parseFloat(prompt('Set '+k,T[k])); if(!isNaN(n)){ T[k]=n; sliders[k].value=n; vals[k].textContent=Math.round(n); refreshOut();} });
    sliders[k].addEventListener('input',()=>{ T[k]=parseFloat(sliders[k].value); vals[k].textContent=sliders[k].value; refreshOut(); });
  });

  function loadSection(i){
    T.section=+i;
    if(window.POSES && window.POSES[i]){
      const P=window.POSES[i];
      T.px=P.pos[0];T.py=P.pos[1];T.pz=P.pos[2];T.lx=P.look[0];T.ly=P.look[1];T.lz=P.look[2];
    }
    keys.forEach(k=>{ sliders[k].value=T[k]; vals[k].textContent=Math.round(T[k]); });
    refreshOut();
  }
  function refreshOut(){
    const r=n=>Math.round(n*100)/100;
    panel.querySelector('#tOut').textContent=
      `{ world:'${WORLD_BY_STOP[T.section]}', pos:[${r(T.px)}, ${r(T.py)}, ${r(T.pz)}], look:[${r(T.lx)}, ${r(T.ly)}, ${r(T.lz)}] },`;
  }
  sel.addEventListener('change',()=>loadSection(sel.value));
  panel.querySelector('#tCopy').addEventListener('click',()=>{
    navigator.clipboard.writeText(panel.querySelector('#tOut').textContent);
    const b=panel.querySelector('#tCopy'); b.textContent='Copied!'; setTimeout(()=>b.textContent='Copy line',1000);
  });
  panel.querySelector('#tGoto').addEventListener('click',()=>{
    const ids=['home','about','projects','work','contact'];
    document.getElementById(ids[T.section]).scrollIntoView({behavior:'smooth',block:'center'});
  });

  addEventListener('keydown',e=>{
    if(e.key==='t'||e.key==='T'){
      // T.on=!T.on;
      // panel.style.display=T.on?'block':'none';
      // if(T.on){ loadSection(sel.value); }
    }
  });
})();