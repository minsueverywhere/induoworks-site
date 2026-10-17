export function createHistory(limit=50) {
  let current,group=false;const past=[],future=[];
  const encode=JSON.stringify;
  function record(value){const next=encode(value);if(group||next===current)return;past.push(current);if(past.length>limit)past.shift();current=next;future.length=0;}
  return {
    reset(value){current=encode(value);past.length=future.length=0;group=false;},
    begin(){group=true;},
    record,
    end(value){group=false;record(value);},
    undo(value){this.end(value);if(!past.length)return null;future.push(current);current=past.pop();return JSON.parse(current);},
    redo(value){this.end(value);if(!future.length)return null;past.push(current);current=future.pop();return JSON.parse(current);},
    canUndo(value){return past.length>0||encode(value)!==current;},
    get canRedo(){return future.length>0;},
  };
}
export function historyShortcut(event){
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.key.toLowerCase()!=='z'||event.target?.closest('input,textarea,select,[contenteditable]'))return null;
  return event.shiftKey?'redo':'undo';
}
