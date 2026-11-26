import { Schema, model, type ClientSession, Types } from 'mongoose';
export const auditActions = ['EXCEL_IMPORTED','STAFF_CREATED','STAFF_APPLICATION_SUBMITTED','STAFF_APPLICATION_REVIEWED','ACCOUNT_UPDATED','TEMP_PASSWORD_ISSUED','PASSWORD_CHANGED','PASSWORD_RESET','PRODUCT_CREATED','PRODUCT_UPDATED','STOCK_ADJUSTED','ORDER_UPDATED','SHIPMENT_UPDATED','PAYMENT_CONFIRMED','REFUND_STARTED','REFUND_CONFIRMED','SETTINGS_UPDATED'] as const;
type AuditAction = typeof auditActions[number];
type Scalar = string | number | boolean | null;
export type AuditChange = { field: string; before: Scalar; after: Scalar };
const schema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  action: { type: String, enum: auditActions, required: true, immutable: true },
  targetType: { type: String, required: true, maxlength: 40, immutable: true },
  targetId: { type: String, required: true, maxlength: 80, immutable: true },
  summary: { type: String, required: true, maxlength: 500, immutable: true },
  changes: { type: [{ field: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, _id: false }], default: [], immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });
export const AuditEvent = model('AuditEvent', schema);
const scalar = (v: unknown): Scalar => v == null ? null : typeof v === 'boolean' || typeof v === 'number' ? v : String(v).slice(0, 500);
// Callers pass an explicit allowlist, never an entire request or user document.
export function auditChanges(before: any, after: any, fields: readonly string[]): AuditChange[] {
  return fields.filter(field => !/password|token|secret|credential/i.test(field) && String(before?.[field] ?? '') !== String(after?.[field] ?? ''))
    .map(field => ({ field, before: scalar(before?.[field]), after: scalar(after?.[field]) }));
}
export async function recordAudit(actorId: string | Types.ObjectId | undefined, action: AuditAction, targetType: string, targetId: string | Types.ObjectId, summary: string, changes: AuditChange[], session: ClientSession) {
  if (!actorId) return;
  await AuditEvent.create([{ actorId, action, targetType, targetId: String(targetId), summary, changes }], { session });
}
