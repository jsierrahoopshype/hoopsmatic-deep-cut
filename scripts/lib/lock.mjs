// Lock a Deep Cut prompt for the Deep Cut server (hoopsmatic-worker deep-cut-server/).
// Copied from the NBA Crossword (scripts/lib/lock.mjs there): same format.
//
//   lock(plain, pub) -> {v, alg, kid, key, iv, data}
//   plain: {v, game, n, date, text, answers:[{id, name, score, link}]}
//   pub:   {kid, jwk} as served at https://hoopsmatic.com/deep-cut/api/pubkey
//
// AES-256-GCM for the prompt (16-byte tag appended, as WebCrypto does), the AES
// key wrapped with RSA-OAEP (SHA-256). Only the server's private key opens it.
import { webcrypto as wc } from 'node:crypto';
import { readFileSync } from 'node:fs';

const b64 = (buf) => Buffer.from(buf).toString('base64');
export const PUBKEY_URL = 'https://hoopsmatic.com/deep-cut/api/pubkey';

// The server's public key: the committed copy (rules/prompt-pubkey.json),
// checked against the live one whenever it answers. GitHub Actions runners
// get a Cloudflare 403 on /deep-cut/api/*, so the live check is best effort,
// but a mismatch always stops the build (locks made with a stale key could
// never be opened).
export async function fetchPubkey(url = PUBKEY_URL) {
  const committed = JSON.parse(readFileSync(new URL('../../rules/prompt-pubkey.json', import.meta.url), 'utf8'));
  if (!committed.kid || committed.jwk?.kty !== 'RSA') throw new Error('rules/prompt-pubkey.json malformed');
  let live = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'HoopsMaticDeepCutBuild/1.0' } });
    if (res.ok) live = await res.json();
    else console.error(`live pubkey: HTTP ${res.status}; using the committed key ${committed.kid}`);
  } catch (e) { console.error(`live pubkey: ${e.message}; using the committed key ${committed.kid}`); }
  if (live && (live.kid !== committed.kid || live.jwk?.n !== committed.jwk.n)) {
    throw new Error(`server key changed (live ${live.kid}, committed ${committed.kid}): update rules/prompt-pubkey.json`);
  }
  return { kid: committed.kid, jwk: committed.jwk };
}

export async function lock(plain, pub) {
  const rsa = await wc.subtle.importKey('jwk', { kty: 'RSA', n: pub.jwk.n, e: pub.jwk.e, alg: 'RSA-OAEP-256', ext: true },
    { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const raw = wc.getRandomValues(new Uint8Array(32));
  const iv = wc.getRandomValues(new Uint8Array(12));
  const aes = await wc.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const data = await wc.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aes, new TextEncoder().encode(JSON.stringify(plain)));
  const key = await wc.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, raw);
  return { v: 1, alg: 'RSA-OAEP-256+A256GCM', kid: pub.kid, key: b64(key), iv: b64(iv), data: b64(data) };
}

// Open a lock with a private JWK (tests only; the real private key lives only
// in the server's secrets).
export async function unlock(lockFile, privJwk) {
  const priv = await wc.subtle.importKey('jwk', { ...privJwk, alg: 'RSA-OAEP-256' }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  const raw = await wc.subtle.decrypt({ name: 'RSA-OAEP' }, priv, Buffer.from(lockFile.key, 'base64'));
  const aes = await wc.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await wc.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(lockFile.iv, 'base64'), tagLength: 128 }, aes, Buffer.from(lockFile.data, 'base64'));
  return JSON.parse(new TextDecoder().decode(plain));
}
