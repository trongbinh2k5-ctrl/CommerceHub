import { randomBytes } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { Category } from './category.model';

export const slugFromName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '') || 'danh-muc';
export async function availableCategorySlug(name: string, session?: ClientSession) {
  const base = slugFromName(name);
  if (!await Category.exists({ slug: base }).session(session || null)) return base;
  // A random suffix avoids counting queries and collisions between parallel writers.
  return `${base}-${randomBytes(6).toString('hex')}`;
}
