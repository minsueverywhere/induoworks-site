export const SIZE = 24;
export const MIN_ZOOM = .25;
export const MAX_ZOOM = 1.6;
export function toScreen(x, y) { return { x: (x - y) * 24, y: (x + y) * 12 }; }
export function toTile(x, y) { return { x: x / 48 + y / 24, y: y / 24 - x / 48 }; }
export function clampCamera(point, size = SIZE) {
  const elevation=typeof size==='number'?0:size.elevation||0;
  const tile = toTile(point.x, point.y+elevation);
  const b=typeof size==='number'?{minX:0,maxX:size-1,minY:0,maxY:size-1}:size;
  const result=toScreen(Math.max(b.minX,Math.min(b.maxX,tile.x)),Math.max(b.minY,Math.min(b.maxY,tile.y)));
  return {x:result.x,y:result.y-elevation};
}
export function panCamera(start, dx, dy, zoom, size = SIZE) {
  return clampCamera({ x: start.x - dx / zoom, y: start.y - dy / zoom }, size);
}
export function clampZoom(value) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)); }
export function defaultZoom(width, height, area = 'village') {
  return area === 'room' ? clampZoom(Math.min((width-30)/500,(height-50)/350,1)) : width < 520 ? .8 : 1.1;
}
export function snapZoom(value) { return value >= .97 && value <= 1.03 ? 1 : clampZoom(value); }
export function isDrag(dx, dy) { return Math.hypot(dx, dy) >= 7; }
export function zoomCamera(camera, oldScale, nextScale, before, after = before, size = SIZE) {
  const scale = clampZoom(nextScale);
  return { scale, camera: clampCamera({x: camera.x + before.x / oldScale - after.x / scale, y: camera.y + before.y / oldScale - after.y / scale}, size) };
}
export function pinchPoints(points) {
  const [a, b] = points;
  return { center: {x: (a.x+b.x)/2, y: (a.y+b.y)/2}, distance: Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)) };
}
