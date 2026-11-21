// Reproducible offline bundle: Three.js r128 and the app are served by Pages, never a CDN.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { iconMarkup } from './lib/icons.js';
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
const bundle=await build({entryPoints:['app.js'],bundle:true,write:false,format:'iife',platform:'browser',target:['es2022'],minify:true});
const three=read('./node_modules/three/build/three.min.js');
const app=bundle.outputFiles[0].text;
let html=read('./index.src.html').replace(/<span data-icon="([a-zA-Z]+)"><\/span>/g,(_,name)=>iconMarkup(name));
if(html.includes('data-icon='))throw new Error('Unresolved icon placeholder');
for(const [marker,source] of [['/*__THREE_INLINE__*/',three],['/*__APP_INLINE__*/',app]]){
  if(html.split(marker).length!==2)throw new Error(`Expected exactly one ${marker}`);
  html=html.replace(marker,()=>source.replace(/<\/script/gi,'<\\/script'));
}
if(/__APP_INLINE__|__THREE_INLINE__|challenge-platform|cloudflareinsights/.test(html))throw new Error('Unresolved placeholder or copied Cloudflare runtime');
mkdirSync('public',{recursive:true});
writeFileSync('public/index.html',html);
writeFileSync('public/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
const hashes=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
writeFileSync('public/_headers',`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
`);
console.log(`Built public/index.html (${Buffer.byteLength(html)} bytes); local Three.js r128, app and CSP.`);
