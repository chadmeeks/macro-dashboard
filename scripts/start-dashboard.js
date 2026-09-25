// Compatibility entry point. Never kill another application's process.
const {spawn}=require('node:child_process');
const path=require('node:path');
const child=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{stdio:'inherit',env:process.env});
child.on('exit',code=>process.exit(code??0));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
