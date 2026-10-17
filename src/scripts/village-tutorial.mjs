export const tutorialSteps = ['drag', 'zoom', 'house', 'music', 'exit'];
export function createTutorial(render,steps=tutorialSteps) {
  let step = -1;
  return {
    start() { step = 0; render(steps[step]); },
    complete(action) {
      if (steps[step] !== action) return;
      step++;
      render(steps[step] || 'done');
    },
    close() { step = -1; render(null); },
  };
}
