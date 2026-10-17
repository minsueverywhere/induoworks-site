export const tutorialSteps = ['drag', 'zoom', 'house', 'music', 'exit'];
export function createTutorial(render,steps=tutorialSteps) {
  let step = -1;
  return {
    start(nextSteps=steps) { steps=nextSteps; step = 0; render(steps[step]); },
    complete(action) {
      if (steps[step] !== action) return;
      step++;
      render(steps[step] || 'done');
    },
    close() { step = -1; render(null); },
  };
}

export function contextTutorialSteps(area,own,{house=false,music=false,exhibit=false}={}) {
  if(area==='room')return ['drag','zoom',...(own?['edit']:exhibit?['work']:[]),'exit'];
  return ['drag','zoom',...(music?['music']:house?['house','exit']:[])];
}
