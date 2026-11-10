import { readServerToken } from './token.ts';

export function secretValues(): string[] {
  return [readServerToken(), ...Object.entries(process.env)
    .filter(([key]) => /(?:API_KEY|PRIVATE_KEY|ENCRYPTION_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key))
    .map(([, value]) => value)].filter((value): value is string => Boolean(value && value.length >= 6)).sort((a,b)=>b.length-a.length);
}
export function redactText(text: string): string {
  let output = text;
  for (const secret of secretValues()) output = output.split(secret).join('[REDACTED]');
  return output.replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]');
}
export function redactValue<T>(value: T): T {
  function visit(item: unknown): unknown {
    if (typeof item === 'string') return redactText(item);
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, /^(?:api[_-]?key|token|authorization|password|secret)$/i.test(key) ? '[REDACTED]' : visit(child)]));
    return item;
  }
  return visit(value) as T;
}
// Keep a suffix so a credential split across two message chunks is never emitted early.
export function safeStreamPrefix(buffer: string): { text: string; rest: string } {
  const secrets = secretValues();
  let retain = 0;
  for (const secret of secrets) {
    for (let length = Math.min(buffer.length, secret.length - 1); length > retain; length -= 1) {
      if (buffer.endsWith(secret.slice(0, length))) { retain = length; break; }
    }
  }
  const boundary = Math.max(0, buffer.length-retain);
  let cursor=0; let text='';
  while(cursor<boundary) {
    const match=secrets.find(secret=>buffer.startsWith(secret,cursor));
    if(match){text+='[REDACTED]';cursor+=match.length;}
    else {text+=buffer[cursor];cursor+=1;}
  }
  return {text:redactText(text),rest:buffer.slice(cursor)};
}
