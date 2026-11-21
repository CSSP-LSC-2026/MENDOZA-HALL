const encoder=new TextEncoder();
export async function hashToken(token){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function randomToken(){return [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function verifyPasscode(actual,expected){
  if(typeof actual!=='string'||actual.length>256||!expected) return false;
  // Web Crypto performs the MAC verification, avoiding a timing-sensitive string comparison.
  const key=await crypto.subtle.importKey('raw',encoder.encode(expected),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const challenge=encoder.encode('mendoza-hall-organizer-v1');
  const signature=await crypto.subtle.sign('HMAC',key,challenge);
  const candidate=await crypto.subtle.importKey('raw',encoder.encode(actual||'\0'),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',candidate,signature,challenge);
}
