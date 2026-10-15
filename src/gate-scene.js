import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { panelPose } from './configurator.js';

export function createGateScene(container, { reducedMotion, color }) {
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
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 50);
  camera.position.set(6.5, 4.3, 8.6);
  const target = new THREE.Vector3(0, 1.35, -1);
  camera.lookAt(target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentRoom = new RoomEnvironment();
  const environment = pmrem.fromScene(environmentRoom, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .55;
  environmentRoom.dispose();
  pmrem.dispose();
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x5a6674, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(2, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30 });
  sun.shadow.bias = -.001;
  sun.shadow.normalBias = .03;
  scene.add(sun);
  const warm = new THREE.PointLight(0xffc579, 18, 8);
  warm.position.set(0, 2.5, -2.3);
  scene.add(warm);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b7ae, roughness: .86 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x858789, roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa6b2bd, roughness: .3, metalness: .8 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color, roughness: .43, metalness: .4 });
  const charcoal = new THREE.MeshStandardMaterial({ color: 0x262d32, roughness: .65, metalness: .2 });
  const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffd09a, emissive: 0xffbc66, emissiveIntensity: 2.7 });
  function box(w, h, d, x, y, z, material, parent = group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(6.6, .14, 5.8, 0, -.13, -1.2, floorMaterial);
  box(.78, 3.5, 3.7, -2.8, 1.68, -1.72, concrete);
  box(.78, 3.5, 3.7, 2.8, 1.68, -1.72, concrete);
  box(5.6, .46, .45, 0, 3.22, -.05, concrete);
  box(6.42, .14, 3.95, 0, 3.51, -1.72, charcoal);
  box(5.6, 3.4, .16, 0, 1.65, -3.52, charcoal);
  box(5.05, .055, .07, 0, 3.02, -.22, lightMaterial);
  box(.08, 2.95, .13, -2.49, 1.45, .02, charcoal);
  box(.08, 2.95, .13, 2.49, 1.45, .02, charcoal);
  box(.16, .9, .12, 2.79, 1.65, .25, charcoal);
  box(.07, .65, .15, 2.79, 1.65, .3, lightMaterial);
  const panels = [];
  for (let i = 0; i < 6; i++) {
    const panel = new THREE.Group();
    group.add(panel);
    box(4.9, .486, .085, 0, 0, 0, doorMaterial, panel);
    box(4.91, .012, .008, 0, -.24, .047, charcoal, panel);
    for (const x of [-2.31, 2.31]) {
      box(.052, .19, .025, x, 0, -.067, metal, panel);
    }
    panels.push(panel);
  }
  // Architectural schematic: the rails show the mechanism, not a manufacturer's CAD.
  for (const x of [-2.52, 2.52]) {
    const points = [];
    for (let i = 0; i <= 70; i++) {
      const pose = panelPose(0, i / 70 * 1.1);
      points.push(new THREE.Vector3(x, pose.y, pose.z - .1));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, .024, 6, false), metal);
    group.add(rail);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.21;
  ground.receiveShadow = true;
  scene.add(ground);
  let opening = 0;
  let targetOpening = 0;
  let angle = .18;
  let targetAngle = .18;
  let cameraPosition = new THREE.Vector3(6.5, 4.3, 8.6);
  let visible = false;
  let frame = 0;
  let previousTime = 0;
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
    group.rotation.y = angle;
    panels.forEach((panel, i) => {
      const pose = panelPose(.25 + i * .5, opening);
      panel.position.set(0, pose.y, pose.z);
      panel.rotation.x = pose.rotation;
    });
    renderer.render(scene, camera);
    if (Math.abs(opening - targetOpening) > .0001 || Math.abs(angle - targetAngle) > .0001 || camera.position.distanceTo(cameraPosition) > .001) requestRender();
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
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Fit the whole garage on tall/narrow phone canvases.
    camera.fov = camera.aspect < 1.3 ? 45 : 34;
    camera.updateProjectionMatrix();
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
    targetAngle = THREE.MathUtils.clamp(pointer.angle + (event.clientX - pointer.x) * .006, -.65, .65);
    requestRender();
  });
  window.addEventListener('pointerup', () => { pointer = null; });
  container.addEventListener('pointercancel', () => { pointer = null; });
  reducedMotion.addEventListener('change', requestRender);
  container.classList.add('scene-ready');
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    container.classList.remove('scene-ready');
    container.querySelector('.scene-loading').textContent = '3D приостановлено браузером. Перезагрузите страницу, чтобы продолжить.';
  });
  return {
    setOpen(open) { targetOpening = open ? 1 : 0; requestRender(); },
    setColor(value) { doorMaterial.color.set(value); requestRender(); },
    setView(view) {
      cameraPosition = view === 'front' ? new THREE.Vector3(0, 2.25, 11) : new THREE.Vector3(6.5, 4.3, 8.6);
      targetAngle = view === 'front' ? 0 : .18;
      requestRender();
    },
  };
}
