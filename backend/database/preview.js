/** Preview-only URL rewriting for published legacy assets with fixed localhost
 * ports. Disk assets stay unchanged. Restrict network destinations so a missed
 * legacy API URL cannot accidentally write into the running MySQL application.
 */
const fs=require('node:fs/promises'),path=require('node:path');
function settings(){
 const permit=Number(process.env.PERMIT_PORT||3001),queue=Number(process.env.QUEUE_PORT||5001);
 const rewrite=text=>text.replace(/localhost:3000/g,'127.0.0.1:'+permit).replace(/localhost:5000/g,'127.0.0.1:'+queue).replace(/127\.0\.0\.1:3000/g,'127.0.0.1:'+permit).replace(/127\.0\.0\.1:5000/g,'127.0.0.1:'+queue).replace(/port:\s*(?:3000|3e3)\b/g,'port:'+permit).replace(/port:\s*(?:5000|5e3)\b/g,'port:'+queue);
 return {permit,queue,rewrite};
}
module.exports=function preview(app,root){
 if(process.env.OFFICE_PG_PREVIEW!=='1')return;
 const {permit,queue,rewrite}=settings();
 async function send(file,res,next){try{res.type(path.extname(file)).send(rewrite(await fs.readFile(file,'utf8')));}catch(e){next(e);}}
 app.use((req,res,next)=>{
  res.append('Content-Security-Policy',`connect-src 'self' http://127.0.0.1:${permit} http://127.0.0.1:${queue} ws://127.0.0.1:${queue}; form-action 'self'`);
  const original=res.sendFile.bind(res);
  const originalSend=res.send.bind(res);
  res.send=body=>originalSend(typeof body==='string'&&/html|javascript/.test(res.get('Content-Type')||'')?rewrite(body):body);
  res.sendFile=(file,...args)=>{if(path.resolve(file).startsWith(path.resolve(root)+path.sep)&&/\.(html|js)$/.test(file))return send(file,res,next);return original(file,...args);};
  next();
 });
};
// Mount AFTER permitPages/session middleware, at the existing static-file boundary.
module.exports.assets=root=>async(req,res,next)=>{
  if(process.env.OFFICE_PG_PREVIEW!=='1')return next();
  if(req.method!=='GET')return next();
  let pathname;try{pathname=decodeURIComponent(req.path);}catch{return next();}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(path.resolve(root)+path.sep)||! /\.(html|js)$/.test(file))return next();
  try{const text=await fs.readFile(file,'utf8');res.type(path.extname(file)).send(settings().rewrite(text));}catch{return next();}
};
