/**
 * Hash de contraseñas con PBKDF2 (Web Crypto): funciona igual en Node y en Cloudflare Workers.
 * Formato guardado: pbkdf2$<iteraciones>$<sal base64>$<hash base64>
 */
const ITERACIONES = 100_000; // tope de PBKDF2 en Workers
const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

async function derivar(password: string, sal: Uint8Array, iteraciones: number): Promise<ArrayBuffer> {
  const clave = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones }, clave, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, sal, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${b64(sal)}$${b64(hash)}`;
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const [alg, iter, sal, hash] = guardado.split('$');
  if (alg !== 'pbkdf2' || !iter || !sal || !hash) return false;
  const calculado = new Uint8Array(await derivar(password, deB64(sal), Number(iter)));
  const esperado = deB64(hash);
  if (calculado.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < calculado.length; i++) diff |= calculado[i]! ^ esperado[i]!;
  return diff === 0;
}

export function tokenAleatorio(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

export async function sha256(texto: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}
