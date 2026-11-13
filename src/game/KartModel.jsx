// A miniature open-wheel racing car built from primitives, facing +Z: front and rear wings, exposed wheels,
// sidepods, airbox, halo and a helmet in the cockpit. `motion` is a plain object the owner mutates every frame
// ({ speed, steer, driftDir, driftLvl, boost, brake }); the model animates itself from it.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { skinOf, trailOf, helmetOf } from '../../shared/catalog.js';
import { nameTexture, shadowTexture } from './textures.js';

const FRONT_R = 0.33, REAR_R = 0.36;
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  // tapered bodies: wide end toward the cockpit
  nose: new THREE.CylinderGeometry(0.09, 0.25, 1.35, 10).rotateX(Math.PI / 2),
  cover: new THREE.CylinderGeometry(0.3, 0.13, 1.4, 10).rotateX(Math.PI / 2),
  frontTyre: new THREE.CylinderGeometry(FRONT_R, FRONT_R, 0.34, 20).rotateZ(Math.PI / 2),
  rearTyre: new THREE.CylinderGeometry(REAR_R, REAR_R, 0.44, 20).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(0.2, 0.2, 1, 14).rotateZ(Math.PI / 2),
  sphere: new THREE.SphereGeometry(1, 18, 12),
  halo: new THREE.TorusGeometry(0.27, 0.034, 6, 14, Math.PI).rotateX(Math.PI / 2),
  flame: new THREE.ConeGeometry(0.15, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
  spark: new THREE.OctahedronGeometry(0.11),
  plane: new THREE.PlaneGeometry(1, 1),
};

const M = {
  tyre: new THREE.MeshStandardMaterial({ color: '#141519', roughness: 0.9 }),
  carbon: new THREE.MeshStandardMaterial({ color: '#17181d', roughness: 0.55, metalness: 0.3 }),
  rim: new THREE.MeshStandardMaterial({ color: '#2a2d36', roughness: 0.4, metalness: 0.7 }),
  visor: new THREE.MeshStandardMaterial({ color: '#0d1018', roughness: 0.15, metalness: 0.7 }),
};
let shadowTex = null;

const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

const tagPos = new THREE.Vector3();

/** A floating label. `fade` hides it when the car is close enough to recognise without one. */
export function NameTag({ name, color = '#ffffff', status = null, fade = true, y = 2.1, size = 1 }) {
  const tex = useMemo(() => nameTexture(name, color, status), [name, color, status]);
  const ref = useRef();
  useFrame(({ camera }) => {
    const s = ref.current;
    if (!s || !fade) return;
    const d = camera.position.distanceTo(s.getWorldPosition(tagPos));
    s.material.opacity = Math.max(0, Math.min(1, (d - 9) / 6));
  });
  return (
    <sprite ref={ref} position={[0, y, 0]} scale={[3.4 * size, 0.71 * size, 1]} renderOrder={5}>
      <spriteMaterial map={tex} transparent depthWrite={false} depthTest={fade} toneMapped={false} />
    </sprite>
  );
}

export function KartModel({ kart, motion, shadows = true }) {
  const skin = skinOf(kart.skin), trail = trailOf(kart.trail), helm = helmetOf(kart.helmet);
  const mats = useMemo(() => {
    const glow = skin.glow ? new THREE.Color(skin.glow) : new THREE.Color('#000000');
    const paint = { roughness: skin.metal ? 0.2 : 0.32, metalness: skin.metal ? 0.9 : 0.25 };
    return {
      body: new THREE.MeshStandardMaterial({ color: skin.body, ...paint }),
      accent: new THREE.MeshStandardMaterial({ color: skin.accent, ...paint, emissive: glow, emissiveIntensity: skin.glow ? 2 : 0 }),
      trim: new THREE.MeshStandardMaterial({ color: skin.trim, roughness: 0.5, metalness: 0.2 }),
      helmet: new THREE.MeshStandardMaterial({ color: helm.color, roughness: helm.metal ? 0.15 : 0.3, metalness: helm.metal ? 0.9 : 0.2 }),
      stripe: new THREE.MeshStandardMaterial({
        color: helm.stripe, roughness: 0.35, emissive: helm.glow ?? '#000000', emissiveIntensity: helm.glow ? 2.4 : 0,
      }),
      tail: new THREE.MeshBasicMaterial({ color: hdr('#ff2018', 1.2), toneMapped: false }),
      flame: new THREE.MeshBasicMaterial({ color: hdr(trail.colors[1], 2.6), toneMapped: false, transparent: true, opacity: 0.9 }),
      flameCore: new THREE.MeshBasicMaterial({ color: hdr(trail.colors[0], 3), toneMapped: false }),
      spark: new THREE.MeshBasicMaterial({ color: hdr('#ffffff', 2), toneMapped: false }),
    };
  }, [skin, trail, helm]);
  const sparkColors = useMemo(
    () => [hdr('#d8dce8', 1.2), hdr(trail.colors[0], 2.4), hdr(trail.colors[1], 2.8), hdr(trail.colors[2], 3.2)],
    [trail]
  );
  const tailColors = useMemo(() => [hdr('#ff2018', 1.1), hdr('#ff2018', 4.5)], []);
  if (!shadowTex) shadowTex = shadowTexture();

  const chassis = useRef(), wheels = useRef([]), fronts = useRef([]), flames = useRef(), sparks = useRef([]);
  const t = useRef(Math.random() * 10);

  useFrame((_, dt) => {
    const m = motion, c = chassis.current;
    if (!c) return;
    t.current += dt;
    const roll = wheels.current;
    for (let i = 0; i < 4; i++) if (roll[i]) roll[i].rotation.x += (m.speed * dt) / (i < 2 ? FRONT_R : REAR_R);
    for (const f of fronts.current) if (f) f.rotation.y = m.steer * 0.36;
    // a stiff car: a little roll in corners, squat under boost, dive under brakes
    const lean = -m.steer * 0.025 - m.driftDir * 0.05;
    c.rotation.z += (lean - c.rotation.z) * Math.min(1, dt * 10);
    const pitch = m.boost > 0 ? -0.035 : m.brake ? 0.03 : 0;
    c.rotation.x += (pitch - c.rotation.x) * Math.min(1, dt * 8);
    c.position.y = Math.sin(t.current * 38) * 0.006 * Math.min(1, Math.abs(m.speed) / 10);
    mats.tail.color.copy(tailColors[m.brake ? 1 : 0]);

    const fl = flames.current;
    if (fl) {
      fl.visible = m.boost > 0;
      if (fl.visible) fl.scale.set(1, 1, 0.9 + Math.random() * 0.7);
    }
    const drifting = m.driftDir !== 0;
    for (let i = 0; i < sparks.current.length; i++) {
      const s = sparks.current[i];
      if (!s) continue;
      s.visible = drifting;
      if (!drifting) continue;
      const side = i < 3 ? 1 : -1;
      s.position.set(side * (0.72 + Math.random() * 0.2), 0.06 + Math.random() * 0.34, -1.1 - Math.random() * 0.8);
      s.scale.setScalar(0.5 + Math.random() * (0.8 + m.driftLvl * 0.5));
      s.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    }
    if (drifting) mats.spark.color.copy(sparkColors[m.driftLvl] ?? sparkColors[0]);
  });

  const cast = shadows;
  const wheelAt = [[0.74, FRONT_R, 1.12], [-0.74, FRONT_R, 1.12], [0.72, REAR_R, -1.04], [-0.72, REAR_R, -1.04]];
  const B = (material, scale, position, shadow = false) => <mesh geometry={G.box} material={material} scale={scale} position={position} castShadow={shadow && cast} />;

  return (
    <group>
      <mesh geometry={G.plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} scale={[2.6, 4.6, 1]} renderOrder={1}>
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={chassis}>
        {/* floor, monocoque and nose */}
        {B(M.carbon, [1.28, 0.05, 2.5], [0, 0.13, -0.05], true)}
        {B(mats.body, [0.56, 0.3, 1.3], [0, 0.35, 0.12], true)}
        <mesh geometry={G.nose} material={mats.body} position={[0, 0.33, 1.3]} scale={[1, 0.72, 1]} castShadow={cast} />
        {B(mats.accent, [0.1, 0.02, 1.5], [0, 0.505, 0.95])}
        {B(mats.trim, [0.5, 0.07, 0.72], [0, 0.53, 0.06])}
        {/* sidepods */}
        {[1, -1].map((s) => (
          <group key={s}>
            {B(mats.body, [0.42, 0.27, 1.2], [s * 0.5, 0.32, -0.28], true)}
            {B(M.carbon, [0.34, 0.17, 0.04], [s * 0.5, 0.35, 0.33])}
            {B(mats.accent, [0.43, 0.045, 1.0], [s * 0.5, 0.465, -0.3])}
            {/* suspension arms */}
            {B(M.carbon, [0.5, 0.025, 0.05], [s * 0.5, 0.36, 1.18])}
            {B(M.carbon, [0.5, 0.025, 0.05], [s * 0.5, 0.3, 1.04])}
            {B(M.carbon, [0.34, 0.025, 0.05], [s * 0.56, 0.36, -1.0])}
          </group>
        ))}
        {/* engine cover, airbox and fin */}
        <mesh geometry={G.cover} material={mats.body} position={[0, 0.48, -0.82]} scale={[0.95, 1, 1]} castShadow={cast} />
        {B(mats.body, [0.22, 0.24, 0.36], [0, 0.8, -0.3], true)}
        {B(M.carbon, [0.15, 0.14, 0.02], [0, 0.82, -0.11])}
        {B(mats.accent, [0.03, 0.26, 0.85], [0, 0.72, -0.9])}
        {/* cockpit: halo and helmet */}
        <mesh geometry={G.halo} material={M.carbon} position={[0, 0.64, 0.0]} />
        {B(M.carbon, [0.04, 0.14, 0.04], [0, 0.585, 0.27])}
        <group position={[0, 0.63, -0.04]}>
          <mesh geometry={G.sphere} material={mats.helmet} scale={0.165} castShadow={cast} />
          {B(M.visor, [0.24, 0.075, 0.1], [0, 0.015, 0.1])}
          {B(mats.stripe, [0.06, 0.02, 0.3], [0, 0.16, -0.01])}
        </group>
        {/* front wing */}
        {B(mats.accent, [1.64, 0.03, 0.36], [0, 0.12, 1.78], true)}
        {B(mats.body, [1.5, 0.03, 0.2], [0, 0.19, 1.68])}
        {B(mats.body, [0.035, 0.2, 0.46], [0.82, 0.19, 1.74])}
        {B(mats.body, [0.035, 0.2, 0.46], [-0.82, 0.19, 1.74])}
        {/* rear wing, beam wing and diffuser */}
        {B(mats.body, [1.16, 0.04, 0.34], [0, 0.92, -1.56], true)}
        {B(mats.accent, [1.16, 0.04, 0.18], [0, 1.0, -1.68])}
        {B(mats.body, [0.035, 0.52, 0.52], [0.58, 0.8, -1.55], true)}
        {B(mats.body, [0.035, 0.52, 0.52], [-0.58, 0.8, -1.55], true)}
        {B(M.carbon, [0.06, 0.42, 0.1], [0, 0.7, -1.48])}
        {B(M.carbon, [0.9, 0.03, 0.16], [0, 0.42, -1.52])}
        {B(M.carbon, [0.9, 0.14, 0.26], [0, 0.2, -1.42])}
        {B(mats.tail, [0.08, 0.13, 0.04], [0, 0.34, -1.76])}
        <group ref={flames} visible={false} position={[0, 0.42, -1.6]}>
          <mesh geometry={G.flame} material={mats.flame} scale={[1, 1, 1.6]} />
          <mesh geometry={G.flame} material={mats.flameCore} scale={[0.5, 0.5, 1]} />
        </group>
      </group>
      {wheelAt.map((p, i) => (
        <group key={i} position={p} ref={(el) => { if (i < 2) fronts.current[i] = el; }}>
          <group ref={(el) => { wheels.current[i] = el; }}>
            <mesh geometry={i < 2 ? G.frontTyre : G.rearTyre} material={M.tyre} castShadow={cast} />
            <mesh geometry={G.rim} material={M.rim} scale={[i < 2 ? 0.36 : 0.46, 1, 1]} />
            <mesh geometry={G.box} material={mats.accent} scale={[i < 2 ? 0.37 : 0.47, 0.07, 0.34]} />
          </group>
        </group>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} ref={(el) => { sparks.current[i] = el; }} geometry={G.spark} material={mats.spark} visible={false} />
      ))}
    </group>
  );
}

export const makeMotion = () => ({ speed: 0, steer: 0, driftDir: 0, driftLvl: 0, boost: 0, brake: false });
