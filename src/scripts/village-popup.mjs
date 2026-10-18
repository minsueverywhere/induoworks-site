export function popupPosition(anchor, popup, scene) {
  const gap = 14, margin = 12;
  const top = scene.top || margin;
  const centered = anchor.x + anchor.width / 2 - popup.width / 2;
  const candidates = [
    { x: centered, y: anchor.y - popup.height - gap, side: 'above' },
    { x: centered, y: anchor.y + anchor.height + gap, side: 'below' },
    { x: anchor.x + anchor.width + gap, y: anchor.y, side: 'right' },
    { x: anchor.x - popup.width - gap, y: anchor.y, side: 'left' },
  ];
  const fits = p => p.x >= margin && p.y >= top && p.x + popup.width <= scene.width - margin && p.y + popup.height <= scene.height - margin;
  const preferred = candidates.find(fits) || candidates[0];
  return {
    x: Math.max(margin, Math.min(scene.width - popup.width - margin, preferred.x)),
    y: Math.max(top, Math.min(scene.height - popup.height - margin, preferred.y)),
    side: preferred.side,
  };
}

export function guestbookFrame(scene,viewportHeight,viewportTop=0){
  const margin=12,width=Math.max(1,Math.min(720,scene.width-margin*2));
  const top=Math.max(56,Math.min(scene.height-margin,viewportTop-scene.top+56));
  const bottom=Math.max(top+1,Math.min(scene.height-margin,viewportTop+viewportHeight-scene.top-margin));
  const available=bottom-top,height=Math.min(available,Math.max(240,available*.85));
  return {x:(scene.width-width)/2,y:top+(available-height)/2,width,height};
}
