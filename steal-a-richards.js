const container = document.getElementById('game');
const WIDTH = 800, HEIGHT = 480;

(function(){
  if(typeof THREE === 'undefined'){
    const overlay = document.getElementById('overlay');
    if(overlay){ overlay.textContent = 'Feil: Three.js ikke lastet. Start en lokal server eller sørg for at nettverk tillater three.min.js.'; overlay.classList.remove('hidden'); }
    const startBtn = document.getElementById('startBtn'); if(startBtn) startBtn.disabled = true;
    console.error('Three.js ikke tilgjengelig — stopper skriptet.');
    return; 
  }
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, WIDTH/HEIGHT, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias:true});
const music = {
  enabled: true,
  ctx: null,
  master: null,
  beat: 0,
  looper: null,
  init(){
    if(this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx){ console.warn('WebAudio not supported, music disabled'); this.enabled = false; return; }
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.08 : 0;
    this.master.connect(this.ctx.destination);
    this.startLoop();
  },
  playTone(freq, start, duration, type='sine', gainValue=0.05){
    if(!this.ctx || !this.master || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  },
  startLoop(){
    if(this.looper) return;
    const notes = [130.81, 164.81, 196.0, 220.0, 196.0, 164.81, 146.83, 174.61];
    this.looper = setInterval(() => {
      if(!this.enabled || !this.ctx) return;
      const t = this.ctx.currentTime;
      const n = notes[this.beat % notes.length];
      this.playTone(n, t, 0.22, 'sine', 0.05);
      if(this.beat % 2 === 0){ this.playTone(n * 2, t + 0.04, 0.2, 'triangle', 0.028); }
      if(this.beat % 4 === 0){ this.playTone(n / 2, t + 0.06, 0.28, 'sawtooth', 0.02); }
      this.beat += 1;
    }, 260);
  },
  ensure(){
    if(!this.ctx){ this.init(); }
    if(this.ctx && this.ctx.state === 'suspended'){ this.ctx.resume(); }
    if(this.enabled && this.master){ this.master.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.08); }
    this.updateButton();
  },
  toggle(){
    this.enabled = !this.enabled;
    if(!this.ctx){ this.init(); }
    if(this.ctx && this.master){
      const target = this.enabled ? 0.08 : 0.0;
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    }
    this.updateButton();
  },
  updateButton(){
    const btn = document.getElementById('musicBtn');
    if(btn){ btn.textContent = `Music: ${this.enabled ? 'On' : 'Off'}`; }
  }
};
// cap device pixel ratio to avoid GPU overload on high-DPI displays
const cappedDPR = Math.min(1.25, window.devicePixelRatio || 1);
renderer.setPixelRatio(cappedDPR);
renderer.setSize(WIDTH, HEIGHT);
// realistic textures and environment
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
let grassTex = null, grassNormal = null, pathTex = null, woodTex = null;
let grusTex = null;
// keep references to materials so we can update them when async textures finish
let grassMatRef = null, foliageMatRef = null, trunkMatRef = null, pathMatRef = null, benchMatRef = null;
// collectible apes array and counter (initialize early so building generation can register them)
let apes = [];
let apesCollected = 0;
let coins = 0;
let activeQuest = null;
// shop / upgrade state
let speedLevel = 0, multiplierLevel = 0;
let playerSpeedBase = 1.2;
let playerSpeedMult = 1.0; // multiplies base speed
let coinMultiplier = 1.0;
// colliders for buildings
let colliders = [];
// prefer a local `grass.png` in the same folder if present
texLoader.load('grass.png', t=>{
  grassTex = t;
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(320,320);
  grassTex.anisotropy = maxAnisotropy;
  grassTex.encoding = THREE.sRGBEncoding;
  // if the park material already exists, apply the map and force update
  if(grassMatRef){ grassMatRef.map = grassTex; grassMatRef.map.encoding = THREE.sRGBEncoding; grassMatRef.needsUpdate = true; }
}, undefined, ()=>{
  // fallback to CDN texture
  texLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg', t=>{
    grassTex = t;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(320,320);
    grassTex.anisotropy = maxAnisotropy;
    grassTex.encoding = THREE.sRGBEncoding;
    if(grassMatRef){ grassMatRef.map = grassTex; grassMatRef.map.encoding = THREE.sRGBEncoding; grassMatRef.needsUpdate = true; }
  });
});
texLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg', t=>{ grassNormal = t; grassNormal.wrapS = grassNormal.wrapT = THREE.RepeatWrapping; grassNormal.repeat.set(40,40); grassNormal.anisotropy = maxAnisotropy; }, undefined, ()=>{ console.warn('Could not load grass normal map; continuing without it.'); });
// try local gravel texture first (grus.png), fallback to CDN brick
texLoader.load('grus.png', t=>{
  grusTex = t; grusTex.wrapS = grusTex.wrapT = THREE.RepeatWrapping; grusTex.repeat.set(6,20); grusTex.anisotropy = maxAnisotropy; grusTex.encoding = THREE.sRGBEncoding;
  if(pathMatRef){ pathMatRef.map = grusTex; pathMatRef.map.encoding = THREE.sRGBEncoding; pathMatRef.needsUpdate = true; }
}, undefined, ()=>{
  texLoader.load('https://threejs.org/examples/textures/brick_diffuse.jpg', t=>{ grusTex = t; grusTex.wrapS = grusTex.wrapT = THREE.RepeatWrapping; grusTex.repeat.set(6,20); grusTex.anisotropy = maxAnisotropy; grusTex.encoding = THREE.sRGBEncoding; if(pathMatRef){ pathMatRef.map = grusTex; pathMatRef.map.encoding = THREE.sRGBEncoding; pathMatRef.needsUpdate = true; } });
});
// try local wood texture first (wood.png), fallback to uv_grid
texLoader.load('wood.png', t=>{
  woodTex = t; woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(2,2); woodTex.anisotropy = maxAnisotropy; woodTex.encoding = THREE.sRGBEncoding;
  if(benchMatRef){ benchMatRef.map = woodTex; benchMatRef.map.encoding = THREE.sRGBEncoding; benchMatRef.needsUpdate = true; }
  if(trunkMatRef){ trunkMatRef.map = woodTex; trunkMatRef.map.encoding = THREE.sRGBEncoding; trunkMatRef.needsUpdate = true; }
}, undefined, ()=>{
  texLoader.load('https://threejs.org/examples/textures/uv_grid_opengl.jpg', t=>{ woodTex = t; woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(2,2); woodTex.anisotropy = maxAnisotropy; woodTex.encoding = THREE.sRGBEncoding; if(benchMatRef){ benchMatRef.map = woodTex; benchMatRef.map.encoding = THREE.sRGBEncoding; benchMatRef.needsUpdate = true; } if(trunkMatRef){ trunkMatRef.map = woodTex; trunkMatRef.map.encoding = THREE.sRGBEncoding; trunkMatRef.needsUpdate = true; } });
});
// environment cubemap for reflections
const cubeLoader = new THREE.CubeTextureLoader();
cubeLoader.setCrossOrigin('anonymous');
const envMap = cubeLoader.load([
  'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg',
  'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg',
  'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg',
  'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg',
  'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg',
  'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'
]);
envMap.encoding = THREE.sRGBEncoding;
scene.environment = envMap;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// place camera so scene is visible by default (higher for larger map)
camera.position.set(0,60,220);
camera.lookAt(0,0,0);

// handle resize
window.addEventListener('resize', ()=>{
  const w = container.clientWidth || WIDTH; const h = container.clientHeight || HEIGHT;
  camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h);
});

// use the loaded cubemap as the scene background (skybox)
scene.background = envMap;
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(10,40,20);
light.castShadow = true;
// default to a moderate shadow resolution; users can increase in settings
light.shadow.mapSize.width = 1024;
light.shadow.mapSize.height = 1024;
light.shadow.camera.near = 1;
light.shadow.camera.far = 200;
light.shadow.camera.left = -80;
light.shadow.camera.right = 80;
light.shadow.camera.top = 80;
light.shadow.camera.bottom = -80;
light.shadow.bias = -0.0005;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.AxesHelper(6));
scene.add(new THREE.GridHelper(1600, 40, 0x444444, 0x222222));

// Sun visual + simple god-ray approximation (additive cone)
const sunDir = new THREE.Vector3(0.8, 0.6, -0.2).normalize();
light.position.copy(sunDir.clone().multiplyScalar(120));
const sunGeom = new THREE.SphereGeometry(8, 16, 8);
const sunMat = new THREE.MeshBasicMaterial({color:0xffee88, transparent:true, opacity:0.95});
const sunMesh = new THREE.Mesh(sunGeom, sunMat);
sunMesh.position.copy(sunDir.clone().multiplyScalar(400));
sunMesh.renderOrder = 999;
sunMesh.material.depthWrite = false;
scene.add(sunMesh);

const coneGeom = new THREE.ConeGeometry(180, 800, 32, 1, true);
const coneMat = new THREE.MeshBasicMaterial({color:0xfff1a8, transparent:true, opacity:0.06, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide});
const cone = new THREE.Mesh(coneGeom, coneMat);
cone.position.copy(sunDir.clone().multiplyScalar(150));
cone.lookAt(0,0,0);
cone.renderOrder = 998;
scene.add(cone);

// create a simple park: grass, paths, trees and benches
function createPark(){
  // grass
  const grassGeo = new THREE.PlaneGeometry(1600,1600,32,32);
  const grassMat = new THREE.MeshStandardMaterial({color:0x3a8b3a, roughness:1.0, metalness:0.0});
  // save reference so async loaders can update it later
  grassMatRef = grassMat;
  if(grassTex){ grassMat.map = grassTex; grassMat.map.encoding = THREE.sRGBEncoding; grassMat.map.repeat.set(320,320); }
  if(grassNormal){ grassMat.normalMap = grassNormal; }
  grassMat.needsUpdate = true;
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI/2;
  grass.receiveShadow = true;
  scene.add(grass);

  // paths (simple rectangular paths)
  const pathMat = new THREE.MeshStandardMaterial({color:0x8b6e4b, roughness:0.85, metalness:0.05});
  // save ref so grusTex fallback can update it
  pathMatRef = pathMat;
  if(grusTex){ pathMat.map = grusTex; pathMat.map.encoding = THREE.sRGBEncoding; pathMat.needsUpdate = true; }
  const pathGeom = new THREE.BoxGeometry(12,0.1,1400);
  const centralPath = new THREE.Mesh(pathGeom, pathMat);
  centralPath.position.set(0,0.05,0);
  centralPath.receiveShadow = true;
  scene.add(centralPath);

  const crossPath = new THREE.Mesh(new THREE.BoxGeometry(1400,0.1,12), pathMat);
  crossPath.position.set(0,0.05,0);
  crossPath.receiveShadow = true;
  scene.add(crossPath);

  // curved path segment (simple arch using boxes)
  for(let i=-1;i<=1;i+=2){
    const p = new THREE.Mesh(new THREE.BoxGeometry(400,0.1,12), pathMat);
    p.position.set(i*600,0.05,450);
    p.rotation.y = 0.5 * (i);
    p.receiveShadow = true;
    scene.add(p);
  }

  // trees and benches
  // prepare trunk and foliage materials (use textures when available)
  const trunkMat = new THREE.MeshStandardMaterial({color:0x6b3b1b});
  trunkMatRef = trunkMat;
  if(woodTex){ trunkMat.map = woodTex; trunkMat.map.encoding = THREE.sRGBEncoding; trunkMat.needsUpdate = true; }
  const foliageMat = new THREE.MeshStandardMaterial({color:0x2e8b2a});
  foliageMatRef = foliageMat;
  if(grassTex){ foliageMat.map = grassTex; foliageMat.map.encoding = THREE.sRGBEncoding; foliageMat.map.repeat.set(6,6); foliageMat.map.wrapS = foliageMat.map.wrapT = THREE.RepeatWrapping; foliageMat.needsUpdate = true; }

  // adapt tree density to device capabilities
  let treeCount = 120;
  if(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) treeCount = 60;
  if((window.devicePixelRatio || 1) > 1.5) treeCount = Math.min(treeCount, 100);
  for(let i=0;i<treeCount;i++){
    const angle = Math.random()*Math.PI*2;
    const radius = 150 + Math.random()*900;
    const x = Math.cos(angle)*radius;
    const z = Math.sin(angle)*radius;
    // avoid putting trees on central paths
    if(Math.abs(x) < 12 && Math.abs(z) < 70) continue;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.8,4,6), trunkMat);
    trunk.position.set(x,2,z);
    trunk.castShadow = true; trunk.receiveShadow = false;
    scene.add(trunk);
    // lower-detail foliage geometry and avoid casting shadows for performance
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(3.6,6,6), foliageMat);
    foliage.position.set(x,5.2,z);
    foliage.castShadow = false; foliage.receiveShadow = false;
    scene.add(foliage);
  }

  // benches near paths
  const benchMat = new THREE.MeshStandardMaterial({color:0x704214, roughness:0.6, metalness:0.05});
  benchMatRef = benchMat;
  if(woodTex){ benchMat.map = woodTex; benchMat.map.encoding = THREE.sRGBEncoding; benchMat.needsUpdate = true; }
  for(let i=0;i<8;i++){
    const bx = -30 + i*9;
    const bz = 22;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3,0.4,1), benchMat);
    seat.position.set(bx,0.9,bz);
    seat.castShadow = true; seat.receiveShadow = true;
    scene.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3,0.6,0.2), benchMat);
    back.position.set(bx,1.4,bz-0.45);
    back.castShadow = true; back.receiveShadow = true;
    scene.add(back);
  }

  // small pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(8,24), new THREE.MeshStandardMaterial({color:0x2b6ea3, roughness:0.3, metalness:0.2, envMap: envMap, envMapIntensity: 0.8}));
  pond.rotation.x = -Math.PI/2;
  pond.position.set(55,0.02,-30);
  pond.receiveShadow = true;
  scene.add(pond);
}

createPark();

// procedural buildings, yellow blocks and crowds
function createBuildingsAndBlocks(){
  const buildingCount = 60;
  const yellowMat = new THREE.MeshStandardMaterial({color:0xffd54a, roughness:0.6, metalness:0.1, emissive:0x886600, emissiveIntensity:0.25});
  const buildingMat = new THREE.MeshStandardMaterial({color:0x8b8f98, roughness:0.85, metalness:0.03});
  if(woodTex){ buildingMat.map = woodTex; buildingMat.needsUpdate = true; }

  for(let i=0;i<buildingCount;i++){
    const bw = rand(8, 40);
    const bd = rand(8, 40);
    const bh = rand(8, 120);
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildingMat);
    // place buildings further out, avoid central park paths
    const angle = Math.random()*Math.PI*2;
    const radius = 80 + Math.random()*900;
    const x = Math.cos(angle)*radius;
    const z = Math.sin(angle)*radius;
    if(Math.abs(x) < 30 && Math.abs(z) < 200) continue;
    b.position.set(x, bh/2, z);
    b.castShadow = true; b.receiveShadow = true;
    scene.add(b);

    // add some yellow windows/blocks on facades
    const windows = Math.floor(rand(6, 30));
    for(let w=0; w<windows; w++){
      if(Math.random() < 0.25) continue;
      const wx = (Math.random()*2-1) * (bw/2 - 0.5);
      const wz = (Math.random()*2-1) * (bd/2 - 0.5);
      const wy = rand(1, bh-1);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.2), yellowMat);
      // randomly attach to one face
      if(Math.random() < 0.5) win.position.set(wx, wy, bd/2 + 0.11);
      else win.position.set(bw/2 + 0.11, wy, wz);
      win.castShadow = false; win.receiveShadow = false;
      b.add(win);
    }
    // add door and roof details
    if(Math.random() < 0.6){
      const doorW = Math.min(3.5, bw*0.5);
      const doorH = Math.min(6, Math.max(2, bh*0.25));
      const doorMat = new THREE.MeshStandardMaterial({color:0x332211, roughness:0.9});
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.28), doorMat);
      // place on front face
      door.position.set(0, doorH/2, bd/2 + 0.16);
      b.add(door);
    }
    // roof
    const roofMat = new THREE.MeshStandardMaterial({color:0x444444, roughness:0.7});
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bw+1, 0.6, bd+1), roofMat);
    roof.position.set(0, bh/2 + 0.3, 0);
    b.add(roof);
    // compute and store collider for this building
    try{ const box = new THREE.Box3().setFromObject(b); colliders.push(box); }catch(e){ console.warn('Could not compute building collider', e); }
  }

  // spawn many small ape NPCs (replace yellow blocks)
  const apeCount = 200;
  for(let i=0;i<apeCount;i++){
    const s = rand(0.6, 1.6);
    const ape = makeApe(s);
    const x = rand(-700,700);
    const z = rand(-700,700);
    ape.position.set(x, s/2, z);
    scene.add(ape);
    apes.push(ape);
  }
}

createBuildingsAndBlocks();

// Spawn quest givers near buildings, park and water
let questGivers = [];
function populateQuestGivers(){
  // park area: near benches and pond
  for(let i=0;i<6;i++){ const q = makeQuestGiver(); q.position.set(rand(-60,60),0,rand(-40,40)); scene.add(q); questGivers.push(q); }
  // city area: near buildings outskirts
  for(let i=0;i<12;i++){ const q = makeQuestGiver(); q.position.set(rand(-500,500),0,rand(-500,-200)); scene.add(q); questGivers.push(q); }
  // water area: near water (we'll place near z>300)
  for(let i=0;i<6;i++){ const q = makeQuestGiver(); q.position.set(rand(-200,200),0,rand(320,680)); scene.add(q); questGivers.push(q); }
}
populateQuestGivers();
// simple roads and cars
function spawnRoadsAndCars(){
  window.cars = window.cars || [];
  // create a few straight roads (long thin boxes)
  const roadMat = new THREE.MeshStandardMaterial({color:0x222222, roughness:0.9});
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(1600,0.1,8), roadMat); r1.position.set(0,0.05,-260); scene.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1600,0.1,8), roadMat); r2.position.set(0,0.05,260); scene.add(r2);
  const r3 = new THREE.Mesh(new THREE.BoxGeometry(8,0.1,1600), roadMat); r3.position.set(-260,0.05,0); scene.add(r3);
  // spawn cars that drive along X on r1/r2 and along Z on r3
  for(let i=0;i<12;i++){
    const car = new THREE.Mesh(new THREE.BoxGeometry(3.6,1.2,1.8), new THREE.MeshStandardMaterial({color: Math.random()*0xffffff}));
    car.position.set(rand(-800,800), 0.7, -260 + (Math.random()*6-3));
    car.userData = { dir: new THREE.Vector3(1,0,0), speed: 18 + Math.random()*12, t:0 };
    scene.add(car); window.cars.push(car);
  }
  for(let i=0;i<8;i++){
    const car = new THREE.Mesh(new THREE.BoxGeometry(3.6,1.2,1.8), new THREE.MeshStandardMaterial({color: Math.random()*0xffffff}));
    car.position.set(-260 + (Math.random()*6-3), 0.7, rand(-800,800));
    car.userData = { dir: new THREE.Vector3(0,0,1), speed: 14 + Math.random()*10, t:0 };
    scene.add(car); window.cars.push(car);
  }
}
spawnRoadsAndCars();


function rand(min,max){ return Math.random()*(max-min)+min }

// simple low-poly humanoid builder
function makeHumanoid(clothColor=0x77e0ff, skin=0xffd9b6){
  const g = new THREE.Group();
  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2,3,1), new THREE.MeshStandardMaterial({color:clothColor}));
  torso.position.y = 1.5;
  g.add(torso);
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.9,8,8), new THREE.MeshStandardMaterial({color:skin}));
  head.position.y = 3.6;
  g.add(head);
  // arms (use pivots so we can animate shoulders)
  const armMat = new THREE.MeshStandardMaterial({color:clothColor});
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.6,2.6,0.6), armMat);
  const rightArm = leftArm.clone();
  // pivot positions at shoulder
  const leftPivot = new THREE.Object3D();
  leftPivot.position.set(-1.45,3.0,0);
  leftArm.position.set(0,-1.3,0);
  leftPivot.add(leftArm);
  g.add(leftPivot);
  const rightPivot = new THREE.Object3D();
  rightPivot.position.set(1.45,3.0,0);
  rightArm.position.set(0,-1.3,0);
  rightPivot.add(rightArm);
  g.add(rightPivot);
  // legs
  const legMat = new THREE.MeshStandardMaterial({color:0x333333});
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.8,2.6,0.8), legMat);
  leftLeg.position.set(-0.45,-0.8,0);
  g.add(leftLeg);
  const rightLeg = leftLeg.clone(); rightLeg.position.x = 0.45; g.add(rightLeg);
  // store parts for animation
  g.userData = { parts: { leftArmPivot: leftPivot, rightArmPivot: rightPivot, head, torso, leftLeg, rightLeg } };
  // enable shadows on meshes inside the group
  g.traverse(node=>{ if(node.isMesh){ node.castShadow = true; node.receiveShadow = true; } });
  return g;
}

function makeQuestGiver(){
  const g = makeHumanoid(0x3399ff, 0xffd9b6);
  // tint all materials blue-ish
  g.traverse(n=>{ if(n.isMesh){ try{ n.material.color.setHex(0x3399ff); }catch(e){} } });
  g.userData.questGiver = true;
  g.userData.questId = 'q' + Math.floor(Math.random()*10000);
  // stationary
  return g;
}

const player = makeHumanoid(0x77e0ff);
// initial position will be set at game start or respawn

// spawn zones for random spawn points
const spawnZones = {
  park: { xMin: -80, xMax: 80, zMin: -120, zMax: 120 },
  city: { xMin: -800, xMax: 800, zMin: -800, zMax: -220 },
  water: { xMin: -220, xMax: 220, zMin: 300, zMax: 720 }
};

function randomSpawnIn(zoneName){
  const z = spawnZones[zoneName] || spawnZones.park;
  const x = rand(z.xMin, z.xMax); const zz = rand(z.zMin, z.zMax);
  return new THREE.Vector3(x, 0, zz);
}

function setRandomSpawn(){
  const zones = ['park','city','water'];
  const pick = zones[Math.floor(Math.random()*zones.length)];
  const pos = randomSpawnIn(pick);
  safeRespawn(pos);
}

// Safely respawn player at given x/z by raycasting down from above the world
function safeRespawn(pos){
  try{
    const origin = new THREE.Vector3(pos.x, 200, pos.z);
    raycaster.set(origin, new THREE.Vector3(0,-1,0));
    raycaster.far = 400;
    const hits = raycaster.intersectObjects(scene.children, true);
    for(const h of hits){ if(isDescendantOf(h.object, player)) continue; // ignore self
      const groundY = h.point.y;
      player.position.set(pos.x, groundY + 1.05, pos.z);
      playerVelocity.set(0,0,0);
      return;
    }
    // fallback if nothing hit
    player.position.set(pos.x, 2.0, pos.z);
    playerVelocity.set(0,0,0);
  }catch(e){
    console.warn('safeRespawn failed, using simple spawn', e);
    player.position.set(pos.x, 2.0, pos.z);
    playerVelocity.set(0,0,0);
  }
}
scene.add(player);

let score = 0;
let gameStarted = false;

function placeRichard(){
  const m = new THREE.Mesh(new THREE.BoxGeometry(3.8,3.8,3.8), new THREE.MeshStandardMaterial({color:0xf6d54a}));
  m.position.set(rand(-700,700),1.9,rand(-400,400));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
let richard = placeRichard();
scene.add(richard);

function makeEnemy(){
  const color = 0xe85c4b;
  const m = makeHumanoid(color);
  m.position.set(rand(-700,700),0,rand(-600,600));
  m.userData.vx = (Math.random()*2-1)*0.6;
  m.userData.vz = (Math.random()*2-1)*0.6;
  m.traverse(n=>{ if(n.isMesh){ n.castShadow = true; n.receiveShadow = true; } });
  return m;
}
// spawn a crowd of moving NPCs (scale with CPU but cap for safety)
let enemies = [];
const cpu = navigator.hardwareConcurrency || 2;
const npcCount = Math.min(160, cpu * 18);
for(let i=0;i<npcCount;i++){ const ne = makeEnemy();
  // randomly make some enemies aggressive (chasing)
  if(Math.random() < 0.22){ ne.userData.chasing = true; ne.userData.aggroRange = 40 + Math.random()*60; }
  enemies.push(ne); scene.add(ne);
}

// (apes already initialized above)

function makeApe(scale=2.0){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({color:0x6b3b1b, roughness:0.8, transparent:true});
  const faceMat = new THREE.MeshStandardMaterial({color:0xffe0b3, roughness:0.9, transparent:true});
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6*scale, 10, 8), bodyMat);
  body.scale.y = 1.15;
  body.position.y = 0.6*scale;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46*scale, 10, 8), faceMat);
  head.position.set(0, 1.2*scale, 0.18*scale);
  g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14*scale,0.66*scale,0.14*scale), bodyMat);
  armL.position.set(-0.52*scale, 0.7*scale, 0);
  g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.52*scale; g.add(armR);
  g.traverse(n=>{ if(n.isMesh){ n.castShadow = true; n.receiveShadow = true; } });
  // mark as collectible ape and store materials for fade
  g.userData = { type: 'ape', collectible: true, mats: [bodyMat, faceMat] };
  return g;
}

function updateHUD(){
  const el = document.getElementById('score');
  if(el){ el.textContent = score + ' | Apes: ' + apesCollected; }
  // also refresh mission text
  try{ updateMissionUI(); }catch(e){}
  const cel = document.getElementById('coinCount'); if(cel) cel.textContent = coins || 0;
  // update new ui panel
  const uCoin = document.getElementById('uiCoin'); if(uCoin) uCoin.textContent = coins || 0;
  const uScore = document.getElementById('uiScore'); if(uScore) uScore.textContent = score || 0;
  const uQuest = document.getElementById('uiQuest'); const uQuestP = document.getElementById('uiQuestProgress');
  if(uQuest){ if(activeQuest) uQuest.textContent = `${activeQuest.type} (${activeQuest.target||activeQuest.giverId||''})`; else uQuest.textContent = 'Ingen'; }
  if(uQuestP){ if(activeQuest){ if(activeQuest.type === 'collect') uQuestP.textContent = `Progress: ${activeQuest.collected||0} / ${activeQuest.target}`; else uQuestP.textContent = ''; } else uQuestP.textContent = ''; }
}

updateHUD();

// --- Simple Missions System ---
let missions = [];
let activeMission = null;
let missionMarker = null;

function updateMissionUI(){
  const mel = document.getElementById('mission');
  if(!mel) return;
  if(!activeMission) mel.textContent = 'Mission: Ingen aktive oppdrag';
  else if(activeMission.type === 'collect_apes') mel.textContent = `Mission: Samle ${activeMission.target.count} apes (Reward: +${activeMission.reward} poeng)`;
  else if(activeMission.type === 'reach_point') mel.textContent = `Mission: Nå punktet (Reward: +${activeMission.reward} poeng)`;
}

function spawnMissionMarker(pos){
  if(missionMarker) try{ scene.remove(missionMarker); }catch(e){}
  const mat = new THREE.MeshBasicMaterial({color:0x88ff88});
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.8,0), mat);
  m.position.copy(pos).add(new THREE.Vector3(0,1.5,0));
  m.userData.bob = Math.random()*10;
  scene.add(m);
  missionMarker = m;
}

function clearMissionMarker(){ if(missionMarker){ try{ scene.remove(missionMarker); }catch(e){} missionMarker = null; } }

function startNextMission(){
  // choose a mission type randomly
  const t = Math.random() < 0.6 ? 'collect_apes' : 'reach_point';
  if(t === 'collect_apes'){
    const need = Math.max(1, Math.floor(rand(3, 9)));
    activeMission = { type: 'collect_apes', target: { count: need }, reward: need * 2, status: 'active', collected: 0 };
    // spawn mission-specific apes around the world (prefer near player)
    spawnMissionApes(activeMission.target.count);
    clearMissionMarker();
  } else {
    const px = rand(-600,600); const pz = rand(-600,600);
    activeMission = { type: 'reach_point', target: { pos: new THREE.Vector3(px, 0, pz) }, reward: 10, status: 'active' };
    spawnMissionMarker(activeMission.target.pos);
  }
  updateMissionUI();
}

function completeActiveMission(){
  if(!activeMission) return;
  score += activeMission.reward;
  // small visual reward
  const r = new THREE.Mesh(new THREE.SphereGeometry(0.28,6,6), new THREE.MeshBasicMaterial({color:0x66ff66}));
  r.position.copy(player.position).add(new THREE.Vector3(0,1.6,0)); scene.add(r);
  setTimeout(()=>{ try{ scene.remove(r); }catch(e){} }, 900);
  activeMission = null;
  clearMissionMarker();
  updateHUD(); updateMissionUI();
  // schedule next mission after a short delay
  setTimeout(()=>{ if(!activeMission) startNextMission(); }, 3000);
}

function spawnMissionApes(count){
  // try to mark existing apes first; otherwise spawn new ones
  let left = count;
  // shuffle apes array copy for randomness
  const shuffled = apes.slice().sort(()=>Math.random()-0.5);
  for(const a of shuffled){ if(left <= 0) break; if(a.userData && a.userData.collectible && !a.userData.missionTarget){ a.userData.missionTarget = true; // change color to indicate mission target
      if(a.userData.mats){ for(const m of a.userData.mats){ try{ m.color.setHex(0x66ff66); m.emissive && m.emissive.setHex(0x224422); }catch(e){} } }
      left--; }
  }
  // if not enough, spawn additional mission apes near player
  for(let i=0;i<left;i++){
    const s = rand(0.9, 1.4);
    const ape = makeApe(s);
    // place near player within 40-140 units
    const angle = Math.random()*Math.PI*2; const dist = rand(15, 140);
    ape.position.set(player.position.x + Math.cos(angle)*dist, s/2, player.position.z + Math.sin(angle)*dist);
    ape.userData.missionTarget = true;
    if(ape.userData.mats){ for(const m of ape.userData.mats){ try{ m.color.setHex(0x66ff66); }catch(e){} } }
    scene.add(ape); apes.push(ape);
  }
  // small HUD refresh to show mission progress
  updateHUD(); updateMissionUI();
}

function spawnMissionApesAt(pos, count){
  for(let i=0;i<count;i++){
    const s = rand(1.0, 1.8);
    const ape = makeApe(s);
    const angle = Math.random()*Math.PI*2; const dist = rand(3, 30);
    ape.position.set(pos.x + Math.cos(angle)*dist, s/2, pos.z + Math.sin(angle)*dist);
    ape.userData.missionTarget = true;
    // associate to current activeQuest if present
    if(activeQuest && activeQuest.giverId) ape.userData.questId = activeQuest.giverId;
    if(ape.userData.mats){ for(const m of ape.userData.mats){ try{ m.color.setHex(0x66ff66); }catch(e){} } }
    scene.add(ape); apes.push(ape);
  }
  updateHUD(); updateMissionUI();
}


// --- Player physics / parkour variables ---
const raycaster = new THREE.Raycaster();
let playerVelocity = new THREE.Vector3(0,0,0);
const GRAVITY = 18.0;
const JUMP_SPEED = 10.0; // base jump speed — higher for parkour
const SPRINT_JUMP_MULT = 1.5; // holding Shift increases jump height
const COYOTE_TIME = 0.12; // seconds
const JUMP_BUFFER = 0.12; // seconds
let coyoteTimer = 0;
let jumpBufferTimer = 0;
let canDoubleJump = true;
const STEP_MAX_HEIGHT = 0.9; // max step-up height for parkour step


const keys = {};
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()] = true });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false });

// jump input handling (buffered)
window.addEventListener('keydown', e=>{
  if(e.code === 'Space'){
    jumpBufferTimer = JUMP_BUFFER;
  }
});

// pointer lock / look controls
const overlay = document.getElementById('overlay');
if(overlay){
  overlay.addEventListener('click', ()=>{
    // try to request pointer lock on the canvas, but fall back to document.body
    const tryElem = renderer.domElement || document.body;
    if(tryElem.requestPointerLock){
      tryElem.requestPointerLock();
      console.log('Pointer lock requested on', tryElem);
    } else {
      overlay.textContent = 'Pointer Lock ikke tilgjengelig i denne konteksten. Start en lokal server (python -m http.server) og prøv igjen.';
      console.warn('Pointer Lock API ikke tilgjengelig');
    }
  });
}

// also accept clicks on the canvas/container as a fallback
const clickFallback = (e) => {
  const elem = renderer.domElement || container || document.body;
  if(elem.requestPointerLock){ elem.requestPointerLock(); console.log('Pointer lock requested (fallback) on', elem); }
};
try{
  if(renderer && renderer.domElement) renderer.domElement.addEventListener('click', clickFallback);
  if(container) container.addEventListener('click', clickFallback);
}catch(e){ console.warn('Could not attach fallback click handlers', e); }

// fallback button
const lockBtn = document.getElementById('lockBtn');
if(lockBtn){
  lockBtn.addEventListener('click', ()=>{
    const elem = renderer.domElement || document.body;
    if(elem.requestPointerLock){ elem.requestPointerLock(); console.log('Pointer lock requested from lockBtn'); }
    else { alert('Pointer Lock ikke tilgjengelig — bruk en moderne nettleser eller start en lokal HTTP-server.'); }
  });
}

const startBtn = document.getElementById('startBtn');
if(startBtn){
  startBtn.addEventListener('click', ()=>{
    music.ensure();
    gameStarted = true;
    // hide overlay and start button
    if(overlay) overlay.classList.add('hidden');
    startBtn.style.display = 'none';
    // show lock button so user can lock mouse if needed
    if(lockBtn) lockBtn.classList.remove('hidden');
    console.log('Game started');
    // start the first mission
    try{ startNextMission(); }catch(e){ console.warn('Could not start mission', e); }
    // spawn player at random
    try{ setRandomSpawn(); }catch(e){ console.warn('spawn failed', e); player.position.set(0,0,0); }
  });
}

// --- Menu handling (Esc to toggle) ---
const mainMenu = document.getElementById('mainMenu');
const resumeBtn = document.getElementById('resumeBtn');
const menuMissionsBtn = document.getElementById('menuMissionsBtn');
const menuSettingsBtn = document.getElementById('menuSettingsBtn');
const quitBtn = document.getElementById('quitBtn');
const menuMissionDetails = document.getElementById('menuMissionDetails');

function showMenu(){
  if(mainMenu) mainMenu.classList.remove('hidden');
  // release pointer lock so user can click
  try{ if(document.exitPointerLock) document.exitPointerLock(); }catch(e){}
  // populate mission details
  if(menuMissionDetails){
    if(!activeMission) menuMissionDetails.textContent = 'Ingen aktiv oppdrag';
    else if(activeMission.type === 'collect_apes') menuMissionDetails.textContent = `Collect ${activeMission.target.count}: ${activeMission.collected||0} / ${activeMission.target.count}`;
    else if(activeMission.type === 'reach_point') menuMissionDetails.textContent = `Reach point — reward: ${activeMission.reward}`;
  }
}

function hideMenu(){
  if(mainMenu) mainMenu.classList.add('hidden');
  // try to lock pointer back to game canvas
  try{ const elem = renderer.domElement || document.body; if(elem.requestPointerLock) elem.requestPointerLock(); }catch(e){}
}

function toggleMenu(){ if(mainMenu && mainMenu.classList.contains('hidden')) showMenu(); else hideMenu(); }

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    // only toggle menu when game has started
    if(gameStarted) toggleMenu();
    else { showMenu(); }
  }
});

if(resumeBtn) resumeBtn.addEventListener('click', ()=>{ hideMenu(); });
if(menuMissionsBtn) menuMissionsBtn.addEventListener('click', ()=>{ showMenu(); if(menuMissionDetails) menuMissionDetails.scrollIntoView({behavior:'smooth'}); });
if(menuSettingsBtn) menuSettingsBtn.addEventListener('click', ()=>{ const sp = document.getElementById('settingsPanel'); if(sp) sp.style.display = (sp.style.display === 'block') ? 'none' : 'block'; showMenu(); });
if(quitBtn) quitBtn.addEventListener('click', ()=>{ location.reload(); });

// settings apply
const applyBtn = document.getElementById('applySettings');
if(applyBtn){
  applyBtn.addEventListener('click', ()=>{
    const shadows = document.getElementById('shadowsToggle').checked;
    const resMult = parseFloat(document.getElementById('resolutionSelect').value) || 1;
    const shadowQuality = parseInt(document.getElementById('shadowQuality').value) || 1024;
    // set pixel ratio multiplier
    renderer.setPixelRatio((window.devicePixelRatio || 1) * resMult);
    // shadows
    renderer.shadowMap.enabled = !!shadows;
    // update light shadow map size
    light.shadow.mapSize.width = shadowQuality;
    light.shadow.mapSize.height = shadowQuality;
    // dispose old shadow map to force reallocation
    if(light.shadow.map){ light.shadow.map.dispose(); light.shadow.map = null; }
    renderer.shadowMap.needsUpdate = true;
    // choose shadow algorithm for softness
    renderer.shadowMap.type = (shadowQuality >= 2048) ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    console.log('Applied settings:', {shadows, resMult, shadowQuality});
  });
}

document.addEventListener('pointerlockerror', ()=>{
  if(overlay){ overlay.textContent = 'Kunne ikke låse musepekeren. Prøv å klikke igjen eller bruk en moderne nettleser.'; overlay.classList.remove('hidden'); }
  console.error('pointerlockerror');
});

document.addEventListener('pointerlockchange', ()=>{
  if(document.pointerLockElement === renderer.domElement){ overlay.classList.add('hidden'); }
  else { overlay.classList.remove('hidden'); }
});

// interact key 'E' — start quest when near a quest giver
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase() === 'e'){
    // find closest quest giver within range
    let nearest = null; let nd = Infinity;
    for(const q of questGivers){ const d = player.position.distanceTo(q.position); if(d < 3.2 && d < nd){ nearest = q; nd = d; } }
    if(nearest){
      // start a simple collect-apes quest
      if(nearest.userData && !activeQuest){
        const need = Math.floor(rand(3,7));
        activeQuest = { giverId: nearest.userData.questId, type: 'collect', target: need, collected: 0, reward: need * 20 };
        coins = coins || 0;
        // spawn mission apes near the quest giver
        spawnMissionApesAt(nearest.position, need);
        const qb = document.getElementById('questBox'); if(qb) qb.textContent = `Oppdrag startet: samle ${need} aper for ${need*20} coins`;
      } else {
        const qb = document.getElementById('questBox'); if(qb) qb.textContent = 'Du har allerede et aktivt oppdrag.';
      }
    }
  }
});

// fullscreen toggle (F key) and menu button
function toggleFullscreen(){
  // Request fullscreen on the game container so only the game goes fullscreen
  const el = document.getElementById('game') || document.documentElement;
  if(!document.fullscreenElement){ if(el.requestFullscreen) el.requestFullscreen(); }
  else { if(document.exitFullscreen) document.exitFullscreen(); }
}
window.addEventListener('keydown', e=>{ if(e.key.toLowerCase() === 'f'){ toggleFullscreen(); } });
const fullscreenBtn = document.getElementById('fullscreenBtn'); if(fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
const musicBtn = document.getElementById('musicBtn');
if(musicBtn){
  music.updateButton();
  musicBtn.addEventListener('click', ()=>{ music.toggle(); });
}
const shopBtn = document.getElementById('shopBtn'); const shopPanel = document.getElementById('shopPanel');
const buySpeed = document.getElementById('buySpeed'); const buyMulti = document.getElementById('buyMulti'); const closeShop = document.getElementById('closeShop'); const resetUpgrades = document.getElementById('resetUpgrades');

function openShop(){ if(shopPanel) shopPanel.style.display = 'block'; updateShopUI(); }
function closeShopUI(){ if(shopPanel) shopPanel.style.display = 'none'; }
function updateShopUI(){ const sl = document.getElementById('speedLevel'); const ml = document.getElementById('multiLevel'); if(sl) sl.textContent = speedLevel; if(ml) ml.textContent = multiplierLevel; }

if(shopBtn) shopBtn.addEventListener('click', ()=>{ openShop(); showMenu(); });
if(closeShop) closeShop.addEventListener('click', ()=>{ closeShopUI(); });
if(buySpeed) buySpeed.addEventListener('click', ()=>{
  const cost = 100 + speedLevel * 60;
  if(coins >= cost){ coins -= cost; speedLevel++; playerSpeedMult = 1 + speedLevel * 0.25; updateHUD(); updateShopUI(); }
});
if(buyMulti) buyMulti.addEventListener('click', ()=>{
  const cost = 150 + multiplierLevel * 100;
  if(coins >= cost){ coins -= cost; multiplierLevel++; coinMultiplier = 1 + multiplierLevel * 0.5; updateHUD(); updateShopUI(); }
});
if(resetUpgrades) resetUpgrades.addEventListener('click', ()=>{ speedLevel=0; multiplierLevel=0; playerSpeedMult=1.0; coinMultiplier=1.0; updateHUD(); updateShopUI(); });

// abandon quest with 'v'
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase() === 'v'){
    if(activeQuest){
      // remove apes associated with this quest
      for(let i = apes.length-1; i >= 0; i--){ const a = apes[i]; if(a.userData && a.userData.questId === activeQuest.giverId){ try{ scene.remove(a); }catch(err){} apes.splice(i,1); } }
      const qb = document.getElementById('questBox'); if(qb) qb.textContent = 'Oppdrag avbrutt.';
      activeQuest = null; updateHUD(); updateMissionUI();
    } else {
      const qb = document.getElementById('questBox'); if(qb) qb.textContent = 'Ingen aktiv oppdrag å forlate.';
    }
  }
});

let yaw = 0, pitch = 0;
const sensitivity = 0.0022;
document.addEventListener('mousemove', e=>{
  if(document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * sensitivity;
  pitch -= e.movementY * sensitivity;
  const limit = Math.PI/2 - 0.05;
  pitch = Math.max(-limit, Math.min(limit, pitch));
});

camera.rotation.order = 'YXZ';

const tmpDir = new THREE.Vector3();
const forwardVec = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const camForward = new THREE.Vector3();

function isDescendantOf(obj, parent){ let o = obj; while(o){ if(o === parent) return true; o = o.parent; } return false; }

function update(dt = 0.016){
  if(!gameStarted) return; // wait for Start
  // base speed modified by upgrades
  let speed = playerSpeedBase * playerSpeedMult;
  if(keys['shift']) speed *= 1.6; // sprint increases movement speed
  // movement relative to camera yaw (forward = camera's -Z)
  tmpDir.set(0,0,0);
  forwardVec.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw));
  if(keys['w']||keys['arrowup']) tmpDir.addScaledVector(forwardVec, 1);
  if(keys['s']||keys['arrowdown']) tmpDir.addScaledVector(forwardVec, -1);
  if(keys['d']||keys['arrowright']) tmpDir.addScaledVector(rightVec, 1);
  if(keys['a']||keys['arrowleft']) tmpDir.addScaledVector(rightVec, -1);
  if(tmpDir.lengthSq() > 0){ tmpDir.normalize(); player.position.addScaledVector(tmpDir, speed); }

  // clamp to larger map bounds
  player.position.x = Math.max(-700, Math.min(700, player.position.x));
  player.position.z = Math.max(-700, Math.min(700, player.position.z));

  enemies.forEach(e=>{
    e.position.x += e.userData.vx;
    e.position.z += e.userData.vz;
    if(e.position.x < -700 || e.position.x > 700) e.userData.vx *= -1;
    if(e.position.z < -700 || e.position.z > 700) e.userData.vz *= -1;
    e.userData.vx += (Math.random()-0.5)*0.02;
    e.userData.vz += (Math.random()-0.5)*0.02;
    const max = 1.2; e.userData.vx = Math.max(-max, Math.min(max, e.userData.vx)); e.userData.vz = Math.max(-max, Math.min(max, e.userData.vz));
  });

  // --- physics: gravity, ground check, jump/parkour ---
  // timers
  if(coyoteTimer > 0) coyoteTimer -= dt;
  if(jumpBufferTimer > 0) jumpBufferTimer -= dt;

  // apply gravity
  playerVelocity.y -= GRAVITY * dt;
  player.position.y += playerVelocity.y * dt;

  // forward-step/parkour: detect small obstacles and step up
  if(tmpDir.lengthSq() > 0){
    const stepOrigin = player.position.clone(); stepOrigin.y += 0.4;
    const fwd = tmpDir.clone().setY(0).normalize();
    raycaster.set(stepOrigin, fwd);
    raycaster.far = 1.0;
    const fwdHits = raycaster.intersectObjects(scene.children, true);
    for(const h of fwdHits){ if(isDescendantOf(h.object, player)) continue; const dh = h.point.y - player.position.y; if(h.distance < 1.0 && dh > 0.05 && dh <= STEP_MAX_HEIGHT){ player.position.y = THREE.MathUtils.lerp(player.position.y, h.point.y + 0.01, 0.6); break; } }
  }

  // ground check (ray down)
  let grounded = false;
  const downOrigin = player.position.clone(); downOrigin.y += 1.2;
  raycaster.set(downOrigin, new THREE.Vector3(0,-1,0));
  raycaster.far = 1.5;
  const hits = raycaster.intersectObjects(scene.children, true);
  for(const h of hits){ if(isDescendantOf(h.object, player)) continue; if(h.distance <= 1.25){ grounded = true; const gy = h.point.y; if(player.position.y <= gy + 0.05 || playerVelocity.y <= 0){ player.position.y = gy; playerVelocity.y = 0; } break; } }

  if(grounded){ coyoteTimer = COYOTE_TIME; canDoubleJump = true; }

  // jump buffering & double-jump
  if(jumpBufferTimer > 0){
    const jumpEff = JUMP_SPEED * (keys['shift'] ? SPRINT_JUMP_MULT : 1);
    if(grounded || coyoteTimer > 0){ playerVelocity.y = jumpEff; jumpBufferTimer = 0; coyoteTimer = 0; }
    else if(!grounded && canDoubleJump){ playerVelocity.y = jumpEff; canDoubleJump = false; jumpBufferTimer = 0; }
  }

  // collisions (distance-based approx — cheaper than computing Box3 each frame)
  // movement with simple building collision
  if(tmpDir.lengthSq() > 0){
    tmpDir.normalize();
    const move = tmpDir.clone().multiplyScalar(speed);
    const newPos = player.position.clone().add(move);
    const playerRadius = 0.95;
    let blocked = false;
    const tmpClosest = new THREE.Vector3();
    for(const box of colliders){ box.clampPoint(newPos, tmpClosest); if(tmpClosest.distanceTo(newPos) < playerRadius){ blocked = true; break; } }
    if(!blocked){ player.position.copy(newPos); }
    else {
      // attempt axis-aligned slide
      const newPosX = player.position.clone().add(new THREE.Vector3(move.x,0,0));
      const newPosZ = player.position.clone().add(new THREE.Vector3(0,0,move.z));
      let bx=false, bz=false;
      for(const box of colliders){ box.clampPoint(newPosX, tmpClosest); if(tmpClosest.distanceTo(newPosX) < playerRadius){ bx=true; break; } }
      for(const box of colliders){ box.clampPoint(newPosZ, tmpClosest); if(tmpClosest.distanceTo(newPosZ) < playerRadius){ bz=true; break; } }
      if(!bx) player.position.copy(newPosX); else if(!bz) player.position.copy(newPosZ);
    }
  }

  if(player.position.distanceTo(richard.position) < 3.5){
    score += 1; document.getElementById('score').textContent = score;
    scene.remove(richard);
    richard = placeRichard(); scene.add(richard);
    // trigger steal animation on player
    player.userData = player.userData || {};
    player.userData.anim = { type: 'steal', t: 0, dur: 0.6 };
    if(Math.random() < 0.5){ const ne = makeEnemy(); enemies.push(ne); scene.add(ne); }
  }

  // check for ape pickups
  for(let i = apes.length-1; i >= 0; i--){
    const a = apes[i];
    if(!a.userData || !a.userData.collectible) continue;
    const d = player.position.distanceTo(a.position);
    if(d < 2.6){
      // start pickup animation instead of immediate removal
      a.userData.collectible = false;
      a.userData.animPickup = { t: 0, dur: 0.6, startY: a.position.y, startScale: a.scale.clone() };
      // optionally nudge ape orientation
      a.userData.startPos = a.position.clone();
    }
  }

  // advance ape pickup animations (fade/scale up then remove)
  for(let i = apes.length-1; i >= 0; i--){
    const a = apes[i];
    if(!a.userData || !a.userData.animPickup) continue;
    const ap = a.userData.animPickup;
    ap.t += dt;
    const p = Math.min(1, ap.t / ap.dur);
    // scale up and float
    const s0 = ap.startScale.x || 1;
    const targetScale = s0 * 1.35;
    const sc = THREE.MathUtils.lerp(s0, targetScale, p);
    a.scale.set(sc, sc, sc);
    a.position.y = THREE.MathUtils.lerp(ap.startY, ap.startY + 1.4, p);
    // fade materials
    if(a.userData.mats){ for(const m of a.userData.mats){ if(m.transparent !== true) m.transparent = true; m.opacity = Math.max(0, 1 - p); } }
    if(p >= 1){
      const wasMissionTarget = !!(a.userData && a.userData.missionTarget);
      try{ scene.remove(a); }catch(e){}
      apes.splice(i,1);
      apesCollected += 1;
      // small coin reward per ape (affected by multiplier)
      const coinGain = Math.ceil(1 * coinMultiplier);
      coins += coinGain;
      if(wasMissionTarget && activeMission && activeMission.type === 'collect_apes'){
        activeMission.collected = (activeMission.collected || 0) + 1;
      }
      updateHUD();
      if(wasMissionTarget && activeQuest && activeQuest.type === 'collect'){
        activeQuest.collected = (activeQuest.collected || 0) + 1;
        if(activeQuest.collected >= activeQuest.target){
          // complete quest (apply coin multiplier)
          const reward = Math.ceil(activeQuest.reward * coinMultiplier);
          coins += reward;
          const qb = document.getElementById('questBox'); if(qb) qb.textContent = `Fullført! Du fikk ${reward} coins.`;
          activeQuest = null;
          updateHUD();
        } else {
          const qb = document.getElementById('questBox'); if(qb) qb.textContent = `Oppdrag: ${activeQuest.collected} / ${activeQuest.target}`;
        }
      }
      // tiny collect particle
      const pmesh = new THREE.Mesh(new THREE.SphereGeometry(0.22,6,6), new THREE.MeshBasicMaterial({color:0xffe082}));
      pmesh.position.copy(player.position).add(new THREE.Vector3(0,1.6,0));
      scene.add(pmesh);
      setTimeout(()=>{ try{ scene.remove(pmesh); }catch(e){} }, 700);
      updateHUD(); updateMissionUI();
    }
  }

  // mission progress checks
  if(activeMission){
    if(activeMission.type === 'collect_apes'){
      if(apesCollected >= activeMission.target.count){ completeActiveMission(); }
    } else if(activeMission.type === 'reach_point'){
      const tp = activeMission.target.pos;
      const d = player.position.distanceTo(tp);
      // consider reached if within 4 units
      if(d < 4.0){ completeActiveMission(); }
    }
  }

  // animate mission marker bobbing if present
  if(missionMarker){ missionMarker.userData.bob += dt * 4.0; missionMarker.position.y += Math.sin(missionMarker.userData.bob) * 0.01; missionMarker.rotation.y += 0.02; }

    // update cars if any
    if(window.cars && window.cars.length){ for(const c of window.cars){ c.userData.t += dt; c.position.addScaledVector(c.userData.dir, c.userData.speed * dt); const p = c.position; if(Math.abs(p.x) > 1200 || Math.abs(p.z) > 1200) { // wrap
      p.x = -p.x * 0.8; p.z = -p.z * 0.8; }
    }}

  for(const e of enemies){
      // aggressive chasing behavior
      if(e.userData && e.userData.chasing){
        const dist = player.position.distanceTo(e.position);
        if(dist < e.userData.aggroRange){
          // move towards player
          const dir = player.position.clone().sub(e.position).setY(0).normalize();
          e.position.addScaledVector(dir, 0.9 + Math.random()*0.6);
        } else {
          e.position.x += e.userData.vx; e.position.z += e.userData.vz;
        }
      }
      if(player.position.distanceTo(e.position) < 2.5){
        if(document.exitPointerLock) document.exitPointerLock();
        alert('Du ble tatt! Score: ' + score);
        score = 0; document.getElementById('score').textContent = score;
        // respawn player at random
        try{ setRandomSpawn(); }catch(err){ player.position.set(0,0,0); }
        // reset a subset of enemies
        enemies.forEach(x=>{ try{ scene.remove(x); }catch(e){} });
        enemies = [];
        const newCount = Math.min(20, cpu * 6);
        for(let i=0;i<newCount;i++){ const ne = makeEnemy(); enemies.push(ne); scene.add(ne); }
        scene.remove(richard); richard = placeRichard(); scene.add(richard);
        break;
      }
  }

  // camera third-person: position behind and above the player using yaw/pitch
  const followDist = 12.5;
  const followHeight = 6.0;
  camForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const camOffset = camForward.clone().multiplyScalar(-followDist);
  camOffset.y = followHeight + Math.sin(pitch) * 1.5;
  camera.position.copy(player.position).add(camOffset);
  // look slightly above player's torso
  camera.lookAt(player.position.x, player.position.y + 1.6, player.position.z);

  // handle steal animation if active
  if(player.userData && player.userData.anim){
    const a = player.userData.anim;
    a.t += dt;
    const p = Math.min(1, a.t / a.dur);
    if(a.type === 'steal'){
      const ang = -1.6 * Math.sin(p * Math.PI);
      const parts = player.userData.parts;
      if(parts){ parts.leftArmPivot.rotation.x = ang; parts.rightArmPivot.rotation.x = ang; }
    }
    if(p >= 1){
      // clear animation
      player.userData.anim = null;
      const parts = player.userData.parts;
      if(parts){ parts.leftArmPivot.rotation.x = 0; parts.rightArmPivot.rotation.x = 0; }
    }
  }
}

// simple FPS throttle + visibility check to save CPU/GPU on weak machines
let lastFrameTime = performance.now();
const targetFPS = (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) ? 30 : 60;
function animate(now){
  now = now || performance.now();
  if(document.hidden){ lastFrameTime = now; requestAnimationFrame(animate); return; }
  const dtMs = now - lastFrameTime;
  const minDt = 1000 / targetFPS;
  if(dtMs < minDt){ requestAnimationFrame(animate); return; }
  const dt = dtMs / 1000;
  lastFrameTime = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

})();