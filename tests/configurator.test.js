import test from 'node:test';
import assert from 'node:assert/strict';
import { panelPose } from '../src/configurator.js';

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
