function editorTheme(){
  let theme='light';try{if(localStorage.getItem('theme')==='dark')theme='dark';}catch{}
  document.documentElement.dataset.theme=theme;
  window.dispatchEvent(new Event('editor-theme'));
}
editorTheme();
window.addEventListener('storage',event=>{if(event.key==='theme'||event.key===null)editorTheme();});
