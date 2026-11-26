export function isValidProductImage(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (value === '') return true;
  if (/^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(value)) return true;
  if (/^\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp|avif)$/i.test(value) && !value.includes('..')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
