import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function createGateScene(container, { reducedMotion, colors, assetUrl }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x142632, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  const target = new THREE.Vector3();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentRoom = new RoomEnvironment();
  const environment = pmrem.fromScene(environmentRoom, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .6;
  environmentRoom.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xe7efff, 0x55515a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.position.set(-4, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 9, bottom: -7, near: .1, far: 35 });
  sun.shadow.bias = -.001;
  sun.shadow.normalBias = .03;
  scene.add(sun);
  const fill = new THREE.PointLight(0xffc579, 24, 11);
  fill.position.set(0, 3, 0);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .24 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.035;
  ground.receiveShadow = true;
  scene.add(ground);

  const gltf = await new GLTFLoader().loadAsync(assetUrl);
  const building = gltf.scene;
  building.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(building);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 5.4 / size.x;
  const house = new THREE.Group();
  house.scale.setScalar(scale);
  house.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  house.add(building);
  const sceneRoot = new THREE.Group();
  scene.add(sceneRoot);
  sceneRoot.add(house);
  target.set(0, size.y * scale * .51, 0);

  const surfaceMaterials = { gate: [], facade: [], roof: [] };
  const doors = new Map();
  const details = { east: [], west: [] };
  function colorMaterial(material, surface) {
    const colored = material.clone();
    colored.color.set(colors[surface]);
    colored.needsUpdate = true;
    surfaceMaterials[surface].push(colored);
    return colored;
  }
  function classify(mesh) {
    const name = mesh.name.toLowerCase().replaceAll('_', ' ');
    const materialName = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name?.toLowerCase() || '';
    if (name.includes('vehicle door closed finite door leaf') || name.includes('original raised door panel') || name.includes('sectional door seated horizontal joint')) return 'gate';
    if (materialName.includes('red running-bond brick')) return 'facade';
    if (materialName.includes('dark natural slate')) return 'roof';
    return null;
  }
  building.traverse(mesh => {
    if (!mesh.isMesh) return;
    const surface = classify(mesh);
    if (surface) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(material => colorMaterial(material, surface))
        : colorMaterial(mesh.material, surface);
    }
    const name = mesh.name.replaceAll('_', ' ');
    const doorMatch = name.match(/Garage lower (east|west) vehicle door closed finite door leaf/i);
    if (doorMatch) {
      const side = doorMatch[1].toLowerCase();
      doors.set(side, { bounds: new THREE.Box3().setFromObject(mesh), material: mesh.material });
      mesh.visible = false;
    }
    if (name.includes('Garage original raised door panel')) {
      const row = Number(name.match(/(\d+)\s*$/)?.[1]);
      const box = new THREE.Box3().setFromObject(mesh);
      const centerPoint = box.getCenter(new THREE.Vector3());
      const side = centerPoint.x >= 0 ? 'east' : 'west';
      const rowIndex = Math.max(0, Math.min(4, Math.round(row / 430) - 1));
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      details[side].push({ geometry, material: mesh.material, rowIndex });
      mesh.visible = false;
    }
    if (name.includes('Garage sectional door seated horizontal joint')) mesh.visible = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  if (doors.size !== 2) throw new Error('The garage model is missing its two named door openings.');

  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: .7, metalness: .12 });
  const sections = [];
  for (const side of ['west', 'east']) {
    const door = doors.get(side);
    const doorSize = door.bounds.getSize(new THREE.Vector3());
    const doorCenter = door.bounds.getCenter(new THREE.Vector3());
    const rowHeight = doorSize.y / 5;
    const doorZ = door.bounds.max.z - .01;
    for (let row = 0; row < 5; row++) {
      const rowY = door.bounds.min.y + rowHeight * (row + .5);
      const section = new THREE.Group();
      section.position.set(doorCenter.x, rowY, doorZ);
      house.add(section);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(doorSize.x - .06, rowHeight - .006, .06), door.material);
      panel.position.z = -.02;
      panel.castShadow = true;
      panel.receiveShadow = true;
      section.add(panel);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(doorSize.x - .1, .012, .014), seamMaterial);
      seam.position.set(0, rowHeight / 2 - .012, .016);
      section.add(seam);
      for (const detail of details[side].filter(item => item.rowIndex === row)) {
        detail.geometry.translate(-doorCenter.x, -rowY, -doorZ);
        const raisedPanel = new THREE.Mesh(detail.geometry, detail.material);
        raisedPanel.castShadow = true;
        raisedPanel.receiveShadow = true;
        section.add(raisedPanel);
      }
      sections.push({ section, door, row, rowHeight, rowY, doorZ });
    }
  }

  let opening = 0;
  let targetOpening = 0;
  let angle = .13;
  let targetAngle = .13;
  let cameraPosition = new THREE.Vector3();
  let view = 'perspective';
  let aspect = 1;
  let visible = false;
  let frame = 0;
  let previousTime = 0;
  function cameraFor(nextView) {
    const narrow = aspect < 1.3;
    if (nextView === 'front') {
      cameraPosition.set(0, target.y + (narrow ? .35 : .6), narrow ? 10.8 : 13.2);
    } else {
      cameraPosition.set(narrow ? 4.1 : 6.1, target.y + (narrow ? 1.9 : 2.0), narrow ? 9.1 : 10.8);
    }
  }
  cameraFor(view);
  camera.position.copy(cameraPosition);
  camera.lookAt(target);
  function clamp01(value) { return Math.max(0, Math.min(1, value)); }
  function smooth(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }
  function render(time = 0) {
    frame = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min((time - previousTime) / 1000 || .016, .05);
    previousTime = time;
    const factor = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 3.6);
    opening += (targetOpening - opening) * factor;
    angle += (targetAngle - angle) * factor;
    camera.position.lerp(cameraPosition, factor);
    camera.lookAt(target);
    sceneRoot.rotation.y = angle;
    for (const item of sections) {
      const { section, door, row, rowHeight, rowY, doorZ } = item;
      const progress = smooth((opening - (4 - row) * .045) / .82);
      const doorBounds = door.bounds;
      const ceilingY = doorBounds.max.y + .48;
      section.position.y = THREE.MathUtils.lerp(rowY, ceilingY, smooth(progress * 1.25));
      section.position.z = THREE.MathUtils.lerp(doorZ, doorZ - (4 - row) * rowHeight, progress);
      section.rotation.x = -Math.PI / 2 * progress;
    }
    renderer.render(scene, camera);
    if (Math.abs(opening - targetOpening) > .0001 || Math.abs(angle - targetAngle) > .001 || camera.position.distanceTo(cameraPosition) > .001) requestRender();
  }
  function requestRender() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
  }
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; requestRender(); });
  visibility.observe(container);
  document.addEventListener('visibilitychange', requestRender);
  const resize = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    aspect = width / height;
    camera.aspect = aspect;
    camera.fov = aspect < 1.3 ? 48 : 34;
    camera.updateProjectionMatrix();
    cameraFor(view);
    requestRender();
  });
  resize.observe(container);
  let pointer;
  container.addEventListener('pointerdown', event => {
    if (event.target !== renderer.domElement) return;
    pointer = { x: event.clientX, y: event.clientY, angle: targetAngle };
  });
  container.addEventListener('pointermove', event => {
    if (!pointer || Math.abs(event.clientY - pointer.y) > Math.abs(event.clientX - pointer.x) + 12) return;
    const limit = aspect < 1.3 ? .48 : .65;
    targetAngle = THREE.MathUtils.clamp(pointer.angle + (event.clientX - pointer.x) * .006, -limit, limit);
    requestRender();
  });
  window.addEventListener('pointerup', () => { pointer = null; });
  container.addEventListener('pointercancel', () => { pointer = null; });
  reducedMotion.addEventListener('change', requestRender);
  container.classList.add('scene-ready');
  container.querySelector('.scene-loading')?.remove();
  return {
    setOpen(open) { targetOpening = open ? 1 : 0; requestRender(); },
    setColor(surface, value) {
      for (const material of surfaceMaterials[surface] || []) material.color.set(value);
      requestRender();
    },
    setView(nextView) {
      view = nextView === 'front' ? 'front' : 'perspective';
      targetAngle = view === 'front' ? 0 : .13;
      cameraFor(view);
      requestRender();
    },
  };
}
