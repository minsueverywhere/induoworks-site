import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeboard,villageSign,isPath,isPond,landscapeNoise,signLetterLayout} from '../src/scripts/village-layout.mjs';
import {toScreen,toTile} from '../src/scripts/village-camera.mjs';

test('landscape noise is stable, varied and bounded',()=>{
  const values=[];
  for(let x=0;x<24;x++)for(let y=0;y<24;y++){
    const value=landscapeNoise(x,y);values.push(value);
    assert.equal(value,landscapeNoise(x,y));assert.ok(value>=0&&value<1);
  }
  assert.ok(new Set(values).size>550);
  assert.ok(values.filter(n=>n<.5).length>200&&values.filter(n=>n<.5).length<380);
  assert.notEqual(landscapeNoise(7,9),landscapeNoise(7,9,1));
});

test('noticeboard including its raised face stays outside the road',()=>{
  const center=toScreen(noticeboard.x,noticeboard.y);
  for(const [dx,dy]of[[-53,-46.5],[43,-94.5],[-51,-49.5],[51,-100.5],[-51,-42.5],[51,-93.5],[-48,14],[48,-34],[-40,29],[-35,26.5],[36,-9],[41,-11.5]]){
    const tile=toTile(center.x+dx,center.y+dy);
    assert.ok(tile.x<9.5,'board reaches the road');
  }
  const feet=toTile(center.x-40,center.y+29);
  assert.ok(9.5-feet.x<=.25,'board is too far from the road edge');
  for(const p of [noticeboard,villageSign]){
    assert.equal(isPath(p.x,p.y),false);assert.equal(isPond(p.x,p.y),false);
  }
  assert.equal(isPath(10,23),true);
  for(const [x,y] of [[4,3],[4,8],[10,8],[14,8],[14,3]])assert.equal(isPath(x,y),true,'workshop entrance must connect to the road');
  assert.equal(isPath(10,24),false);
});

test('narrow letters keep the same visible gap as wide letters',()=>{
  const metrics=[
    {actualBoundingBoxLeft:-3,actualBoundingBoxRight:8},
    {actualBoundingBoxLeft:-1,actualBoundingBoxRight:24},
    {actualBoundingBoxLeft:1,actualBoundingBoxRight:26},
  ];
  const layout=signLetterLayout(metrics);
  for(let i=1;i<metrics.length;i++){
    const previousRight=layout.positions[i-1]+metrics[i-1].actualBoundingBoxRight;
    const nextLeft=layout.positions[i]-metrics[i].actualBoundingBoxLeft;
    assert.equal(nextLeft-previousRight,4);
  }
  assert.equal(layout.positions[0]-metrics[0].actualBoundingBoxLeft,0);
  assert.equal(layout.width,layout.positions[2]+metrics[2].actualBoundingBoxRight);
  assert.deepEqual(signLetterLayout([]),{positions:[],width:0});
});
