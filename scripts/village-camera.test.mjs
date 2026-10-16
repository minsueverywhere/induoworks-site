import assert from 'node:assert/strict';
import {SIZE,toScreen,toTile,clampCamera,panCamera,clampZoom,defaultZoom,snapZoom,isDrag,zoomCamera,pinchPoints} from '../src/scripts/village-camera.mjs';
for (const [x,y] of [[0,0],[7,12],[23,23],[4.5,9.2]]) {
  const p=toScreen(x,y),tile=toTile(p.x,p.y);
  assert.ok(Math.abs(tile.x-x)<1e-9 && Math.abs(tile.y-y)<1e-9);
}
for (const point of [{x:1e6,y:-1e6},{x:-1e6,y:1e6},{x:0,y:-300},{x:0,y:5000}]) {
  const clamped=clampCamera(point),tile=toTile(clamped.x,clamped.y);
  assert.ok(tile.x>=0 && tile.x<SIZE && tile.y>=0 && tile.y<SIZE);
  assert.deepEqual(clampCamera(clamped),clamped);
}
const start=toScreen(10,10);
const moved=panCamera(start,80,40,.8);
assert.ok(Math.abs(moved.x+100)<1e-9 && Math.abs(moved.y-190)<1e-9);
assert.deepEqual(panCamera(start,0,0,1),start);
assert.equal(isDrag(3,4),false); assert.equal(isDrag(7,0),true);
assert.equal(clampZoom(.01),.25); assert.equal(clampZoom(20),1.6);
assert.equal(defaultZoom(260,400),.8);assert.equal(defaultZoom(519,480),.8);
assert.equal(defaultZoom(520,480),1.1);assert.equal(defaultZoom(976,480),1.1);
assert.equal(defaultZoom(260,400,'room'),.46);assert.equal(defaultZoom(976,480,'room'),1);
assert.equal(defaultZoom(10,10,'room'),.25);
for(const value of [.97,.99,1,1.01,1.03])assert.equal(snapZoom(value),1);
for(const value of [.96,1.04,.25,1.6])assert.equal(snapZoom(value),value);
assert.equal(snapZoom(0),.25);assert.equal(snapZoom(2),1.6);
// The map point under a wheel cursor or pinch midpoint must stay under that point.
const before={x:60,y:-30},after={x:80,y:-10};
for (const [nextScale,destination] of [[1.3,before],[.5,after],[30,after]]) {
  const next=zoomCamera(start,.8,nextScale,before,destination);
  assert.ok(Math.abs(next.camera.x+destination.x/next.scale-(start.x+before.x/.8))<1e-9);
  assert.ok(Math.abs(next.camera.y+destination.y/next.scale-(start.y+before.y/.8))<1e-9);
}
const pinch=pinchPoints([{x:0,y:0},{x:60,y:80}]);
assert.deepEqual(pinch,{center:{x:30,y:40},distance:100});
assert.equal(pinchPoints([{x:3,y:3},{x:3,y:3}]).distance,1);
// Indoor panning and zoom must respect the smaller floor rather than the village bounds.
for(const point of [{x:900,y:900},{x:-900,y:-900}]) {
  const room=toTile(...Object.values(clampCamera(point,10)));
  assert.ok(room.x>=0&&room.x<=9&&room.y>=0&&room.y<=9);
}
const inside=panCamera(toScreen(4,4),-9999,-9999,1,10);
assert.deepEqual(toTile(inside.x,inside.y),{x:9,y:9});
assert.ok(SIZE===24);
console.log('Village camera: projection, drag threshold, zoom and large-map bounds passed.');
