import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { panelPose, scenePalettes } from '../src/configurator.js';

test('detailed showroom model includes named door parts and tintable building surfaces', async () => {
  const bytes = await readFile(new URL('../web-public/media/garage-apartment.glb', import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const names = model.meshes.map(mesh => mesh.name || '');
  assert.ok(names.some(name => name.includes('vehicle door closed finite door leaf')));
  assert.ok(names.some(name => name.includes('original raised door panel')));
  assert.ok(model.materials.some(material => material.name.includes('red running-bond brick')));
  assert.ok(model.materials.some(material => material.name.includes('dark natural slate')));
});

test('showroom colors can be selected independently for gate, facade, and roof', () => {
  assert.deepEqual(Object.keys(scenePalettes).sort(), ['facade', 'gate', 'roof']);
  for (const palette of Object.values(scenePalettes)) {
    assert.ok(palette.colors[palette.initial]);
    assert.equal(Object.keys(palette.colors).length, 4);
    assert.ok(Object.values(palette.colors).every(color => /^#[\da-f]{6}$/i.test(color.value)));
  }
});

test('sectional panels follow a continuous path into the garage', () => {
  const closed = panelPose(0.25,0);
  assert.equal(closed.y,0.25);
  assert.equal(closed.z,0);
  assert.equal(closed.rotation,0);
  assert.equal(panelPose(2.75,0).rotation,0, 'top section stays vertical when closed');
  const open = panelPose(0.25,1);
  assert.ok(open.y > 2.8);
  assert.ok(open.z < -0.6);
  assert.equal(open.rotation,-Math.PI/2);
  for(let p=0;p<=1;p+=.01){
    const pose=panelPose(1.25,p);
    assert.ok(Object.values(pose).every(Number.isFinite));
    const next=panelPose(1.25,Math.min(1,p+.001));
    assert.ok(Math.abs(pose.y-next.y)<.02);
    assert.ok(Math.abs(pose.z-next.z)<.02);
  }
});
