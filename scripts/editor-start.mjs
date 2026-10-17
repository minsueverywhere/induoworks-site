import { execFileSync } from 'node:child_process';
execFileSync(process.execPath,['node_modules/astro/bin/astro.mjs','dev','--background','--host','127.0.0.1','--port','4323'],{stdio:'inherit',windowsHide:true,env:{...process.env,INDUO_EDITOR:'1',WRANGLER_LOG_PATH:process.cwd()+'/.wrangler/logs/'}});
console.log('Local editor: http://127.0.0.1:4323/__editor/');
