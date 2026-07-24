// CRM metadata & demo seed for the Clients page. Domain rows (clients,
// projects) persist via `db`; per-client demo aggregates and project extras
// (due dates, stages, notes, linked devis numbers) live in this sidecar store.
import { useCallback, useState } from 'react';
import type { Client, Project } from '@/lib/types';
import { db, uid } from '@/lib/storage';

export interface ClientStats {
  devis: number;
  accepted: number;
  total: number; // DA
  lastActivity: string;
}

export interface ProjectExtra {
  due?: string; // ISO date
  stage?: string; // production stage label
  devisRefs?: string[]; // devis numbers e.g. ["D-0147"]
  total?: number; // DA
  notes?: string;
}

export interface CrmMeta {
  stats: Record<string, ClientStats>;
  projects: Record<string, ProjectExtra>;
}

const KEY = 'arteam-printflow:crm-meta';
const SEED_FLAG = 'arteam-printflow:crm-demo-seeded';

function loadMeta(): CrmMeta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { stats: {}, projects: {} };
    const parsed = JSON.parse(raw) as CrmMeta;
    return { stats: parsed.stats ?? {}, projects: parsed.projects ?? {} };
  } catch {
    return { stats: {}, projects: {} };
  }
}

function saveMeta(m: CrmMeta): void {
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function useCrmMeta(): [CrmMeta, (patch: Partial<CrmMeta>) => void] {
  const [meta, setMeta] = useState<CrmMeta>(loadMeta);
  const update = useCallback((patch: Partial<CrmMeta>) => {
    setMeta((prev) => {
      const next = { ...prev, ...patch };
      saveMeta(next);
      return next;
    });
  }, []);
  return [meta, update];
}

// ------------------------------- demo seed -----------------------------------

const DAYS = 86_400_000;

export function seedCrmDemo(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG)) return;
  if (db.clients.list().length > 0) {
    localStorage.setItem(SEED_FLAG, '1');
    return;
  }
  const now = Date.now();
  const clients: (Client & { city?: string })[] = [
    { id: uid('cl'), name: 'يوسف بن عمر', company: 'مطعم الزيتونة', phone: '0550 12 34 56', email: 'youssef@zitouna.dz', address: 'شارع ديدوش مراد، الجزائر', notes: 'عميل وفود — يفضّل التسليم يوم الخميس', createdAt: new Date(now - 120 * DAYS).toISOString() },
    { id: uid('cl'), name: 'سارة مرابط', company: 'Librairie El Yasmine', phone: '0661 23 45 67', email: 'sara@elyasmine.dz', address: 'حيدرة، الجزائر', createdAt: new Date(now - 200 * DAYS).toISOString() },
    { id: uid('cl'), name: 'كمال حداد', company: 'وكالة Atlas Pub', phone: '0770 34 56 78', email: 'k.haddad@atlaspub.dz', address: 'وهران', createdAt: new Date(now - 90 * DAYS).toISOString() },
    { id: uid('cl'), name: 'ليلى بوضياف', company: 'Pharmacie Centrale', phone: '0555 45 67 89', email: 'contact@pharmcentrale.dz', address: 'سطيف', createdAt: new Date(now - 300 * DAYS).toISOString() },
    { id: uid('cl'), name: 'عمر شريف', company: 'Atelier Nour Décoration', phone: '0662 56 78 90', email: 'omar@nourdeco.dz', address: 'عنابة', createdAt: new Date(now - 45 * DAYS).toISOString() },
  ];
  clients.forEach((c) => db.clients.create(c));

  const stats: Record<string, ClientStats> = {
    [clients[0].id]: { devis: 14, accepted: 9, total: 412000, lastActivity: 'قبل 3 أيام' },
    [clients[1].id]: { devis: 8, accepted: 5, total: 168500, lastActivity: 'أمس' },
    [clients[2].id]: { devis: 21, accepted: 13, total: 1240000, lastActivity: 'قبل أسبوع' },
    [clients[3].id]: { devis: 6, accepted: 4, total: 96800, lastActivity: 'قبل 12 يوم' },
    [clients[4].id]: { devis: 3, accepted: 1, total: 54000, lastActivity: 'اليوم' },
  };

  const projects: Project[] = [
    { id: uid('pr'), clientId: clients[0].id, name: 'هوية مطعم الزيتونة', status: 'active', createdAt: new Date(now - 20 * DAYS).toISOString() },
    { id: uid('pr'), clientId: clients[1].id, name: 'كاتالوغ Librairie El Yasmine', status: 'active', createdAt: new Date(now - 12 * DAYS).toISOString() },
    { id: uid('pr'), clientId: clients[2].id, name: 'حملة Atlas Pub — Grand Format', status: 'paused', createdAt: new Date(now - 30 * DAYS).toISOString() },
    { id: uid('pr'), clientId: clients[3].id, name: 'Étiquettes Pharmacie Centrale', status: 'done', createdAt: new Date(now - 60 * DAYS).toISOString() },
  ];
  projects.forEach((p) => db.projects.create(p));

  const projectExtras: Record<string, ProjectExtra> = {
    [projects[0].id]: { devisRefs: ['D-0147', 'D-0152'], total: 87000, stage: 'تصميم', due: new Date(now + 6 * DAYS).toISOString().slice(0, 10) },
    [projects[1].id]: { devisRefs: ['D-0151'], total: 64000, stage: 'طباعة', due: new Date(now + 10 * DAYS).toISOString().slice(0, 10) },
    [projects[2].id]: { devisRefs: ['D-0139', 'D-0140', 'D-0141'], total: 210000, stage: 'قص وتشطيب', due: new Date(now - 2 * DAYS).toISOString().slice(0, 10) },
    [projects[3].id]: { devisRefs: ['D-0122'], total: 38500, stage: 'تسليم', due: new Date(now - 15 * DAYS).toISOString().slice(0, 10) },
  };

  saveMeta({ stats, projects: projectExtras });
  localStorage.setItem(SEED_FLAG, '1');
}

// ------------------------------ helpers --------------------------------------

const AVATAR_COLORS = ['#E0F2FE|#0369A1', '#FCE7F3|#BE185D', '#FEF3C7|#B45309', '#DCFCE7|#15803D', '#EDE9FE|#6D28D9', '#FFEDD5|#C2410C'];

export function avatarColor(name: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR_COLORS[h % AVATAR_COLORS.length].split('|');
  return { bg, fg };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

export function clientCity(c: Client): string {
  return c.address?.split('،').pop()?.trim() || c.address || '—';
}
