// Scrolls a one-line label back and forth only when it does not fit its box.
export function fitMarquee(box){
  const extra=box.firstElementChild.scrollWidth-box.clientWidth;
  box.dataset.overflow=String(extra>1);
  box.style.setProperty('--marquee-shift',-Math.max(0,extra)+'px');
  box.style.setProperty('--marquee-time',Math.max(6,extra/15)+'s');
}
