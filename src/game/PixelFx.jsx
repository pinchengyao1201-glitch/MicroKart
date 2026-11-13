// Pixel-art effects from the pixelfx library, played as camera-facing sprites in the 3D world: each live
// effect draws into its own small frame, which is composited to a canvas texture 30 times a second.
// Anything in the game can ask for one with spawnFx(name, x, z) from live.js.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createFrame, clearFrame, createFx, composite } from 'pixelfx';
import * as poof from 'pixelfx/fx/spawn/poof';
import * as hitSpark from 'pixelfx/fx/impacts/hit-spark';
import * as confetti from 'pixelfx/fx/ui/confetti';
import * as firework from 'pixelfx/fx/explosions/firework-burst';
import { live } from './live.js';

// name -> the effect module, its options, and how big one of its pixels is in world units
const EFFECTS = {
  poof: { mod: poof, opts: {}, px: 0.06 },
  spark: { mod: hitSpark, opts: {}, px: 0.04 },
  confetti: { mod: confetti, opts: {}, px: 0.06 },
  firework: { mod: firework, opts: {}, px: 0.07 },
};

const MAX = 14;

function makeSlot(scene) {
  const canvas = document.createElement('canvas');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  sprite.renderOrder = 10;
  scene.add(sprite);
  return { canvas, ctx: canvas.getContext('2d'), tex, mat, sprite, fx: null, frame: null, img: null, acc: 0 };
}

function start(slot, req) {
  const def = EFFECTS[req.name];
  if (!def) return;
  const meta = def.mod.meta, [w, h] = meta.size, [ox, oy] = meta.origin;
  if (slot.canvas.width !== w || slot.canvas.height !== h) {
    slot.canvas.width = w;
    slot.canvas.height = h;
    slot.tex.dispose(); // the texture is re-uploaded at its new size
  }
  slot.frame = createFrame(w, h);
  slot.img = new ImageData(w, h);
  slot.fx = createFx(def.mod, { x: ox, y: oy, seed: (Math.random() * 1e6) | 0, ...def.opts, ...req.opts });
  slot.acc = 1;
  const s = def.px * req.scale;
  slot.sprite.scale.set(w * s, h * s, 1);
  slot.sprite.center.set(ox / w, 1 - oy / h);
  slot.sprite.position.set(req.x, req.y, req.z);
  slot.sprite.visible = true;
}

export function PixelFx() {
  const group = useRef(), slots = useRef([]);
  useEffect(
    () => () => {
      for (const s of slots.current) {
        s.sprite.removeFromParent();
        s.tex.dispose();
        s.mat.dispose();
      }
      slots.current = [];
    },
    []
  );

  useFrame((_, dt) => {
    const list = slots.current;
    while (live.fx.length) {
      const req = live.fx.shift();
      let slot = list.find((s) => !s.fx);
      if (!slot && list.length < MAX) list.push((slot = makeSlot(group.current)));
      if (slot) start(slot, req);
    }
    for (const s of list) {
      if (!s.fx) continue;
      s.fx.update(Math.min(dt, 0.05));
      s.acc += dt * 30;
      if (s.acc >= 1) {
        s.acc = 0;
        clearFrame(s.frame);
        s.fx.draw(s.frame);
        composite(s.frame, s.img.data, null);
        s.ctx.putImageData(s.img, 0, 0);
        s.tex.needsUpdate = true;
      }
      if (s.fx.done()) {
        s.fx = null;
        s.sprite.visible = false;
      }
    }
  });

  return <group ref={group} />;
}
