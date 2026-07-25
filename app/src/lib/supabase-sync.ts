import { exportLocalSnapshot } from './storage';
import { getSupabaseUser, isSupabaseConfigured, supabase } from './supabase';

const SYNC_TABLE = 'printflow_records';
const BATCH_SIZE = 200;

type Snapshot = ReturnType<typeof exportLocalSnapshot>;
type SnapshotKind = keyof Snapshot;

interface SyncRow {
  owner_id: string;
  kind: SnapshotKind;
  entity_id: string;
  data: unknown;
  updated_at: string;
}

export interface SupabaseStatus {
  configured: boolean;
  authenticated: boolean;
  recordCount?: number;
  message: string;
}

function rowId(entity: unknown, fallback: string): string {
  if (typeof entity === 'object' && entity !== null && 'id' in entity) {
    const id = (entity as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id;
  }
  return fallback;
}

function rowsFromSnapshot(snapshot: Snapshot, ownerId: string): SyncRow[] {
  const now = new Date().toISOString();
  return (Object.entries(snapshot) as [SnapshotKind, Snapshot[SnapshotKind]][]).flatMap(([kind, rows]) =>
    rows.map((entity, index) => ({
      owner_id: ownerId,
      kind,
      entity_id: rowId(entity, `${kind}-${index}`),
      data: entity,
      updated_at: now,
    })),
  );
}

export async function getSupabaseStatus(): Promise<SupabaseStatus> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      configured: false,
      authenticated: false,
      message: 'أضف متغيرات Supabase في ملف .env ثم أعد تشغيل التطبيق.',
    };
  }
  const user = await getSupabaseUser();
  if (!user) {
    return {
      configured: true,
      authenticated: false,
      message: 'المفاتيح موجودة. سجّل الدخول بحساب Supabase لتفعيل المزامنة الآمنة.',
    };
  }
  const { count, error } = await supabase
    .from(SYNC_TABLE)
    .select('entity_id', { count: 'exact', head: true });
  if (error) {
    return {
      configured: true,
      authenticated: true,
      message: `الاتصال يعمل، لكن جدول Supabase غير جاهز: ${error.message}`,
    };
  }
  return {
    configured: true,
    authenticated: true,
    recordCount: count ?? 0,
    message: 'Supabase متصل وجاهز للمزامنة.',
  };
}

export async function pushLocalSnapshotToSupabase(): Promise<{ count: number }> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase غير مفعّل.');
  const user = await getSupabaseUser();
  if (!user) throw new Error('سجّل الدخول بحساب Supabase قبل المزامنة.');

  const rows = rowsFromSnapshot(exportLocalSnapshot(), user.id);
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from(SYNC_TABLE)
      .upsert(batch, { onConflict: 'owner_id,kind,entity_id' });
    if (error) throw error;
  }
  return { count: rows.length };
}
