// ---------------------------------------------------------------------------
// Demo dataset — materialized into the `db` repository (localStorage) so the
// archive and the wizard work on real entities with frozen pricing snapshots.
// Idempotent: each store seeds once, only while it is empty.
// ---------------------------------------------------------------------------

import { db, uid } from '@/lib/storage';
import { computeMontage } from '@/lib/montage-engine';
import { priceItem } from '@/lib/pricing-engine';
import type {
  Client,
  Devis,
  DevisItem,
  DevisStatus,
  DimensionValue,
  MontageResult,
  PrintMethod,
  Project,
  Service,
} from '@/lib/types';
import { addDays, devisTotals } from './devis-utils';

const CLIENTS_FLAG = 'arteam-printflow:demo-clients-v1';
const DEVIS_FLAG = 'arteam-printflow:demo-devis-v1';

function flagged(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true;
  }
}

function setFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* storage unavailable — seeding stays ephemeral */
  }
}

// ------------------------------- clients ------------------------------------

const DEMO_CLIENTS: Omit<Client, 'id' | 'createdAt'>[] = [
  { name: 'يوسف بن عمر', company: 'مطعم الزيتونة', phone: '0550 12 34 56', email: 'contact@zitouna.dz', address: 'حيدرة، الجزائر العاصمة' },
  { name: 'أمينة لعرابة', company: 'مقهى الروضة', phone: '0661 22 44 66', email: 'raoudha.cafe@gmail.com', address: 'باب الزوار، الجزائر' },
  { name: 'كمال حدادي', company: 'مكتبة النور', phone: '0770 98 76 54', email: 'librairie.nour@outlook.com', address: 'وسط المدينة، وهران' },
  { name: 'سارة بلقاسم', company: 'وكالة الأفق', phone: '0555 33 21 00', email: 'sara@ofouk-agency.dz', address: 'سيدي يحيى، الجزائر' },
];

export function ensureDemoClients(): Client[] {
  db.ensureSeeded();
  if (!flagged(CLIENTS_FLAG) && db.clients.list().length === 0) {
    const now = Date.now();
    DEMO_CLIENTS.forEach((c, i) => {
      db.clients.create({ ...c, id: uid('cli'), createdAt: new Date(now - (30 - i) * 86400000).toISOString() });
    });
    const clients = db.clients.list();
    const mk = (clientId: string, name: string): Project => ({
      id: uid('prj'), clientId, name, status: 'active', createdAt: new Date(now - 20 * 86400000).toISOString(),
    });
    if (clients[0]) db.projects.create(mk(clients[0].id, 'هوية المطعم 2025'));
    if (clients[0]) db.projects.create(mk(clients[0].id, 'قائمة رمضان'));
    if (clients[3]) db.projects.create(mk(clients[3].id, 'حملة إشهارية'));
    setFlag(CLIENTS_FLAG);
  }
  return db.clients.list();
}

// ------------------------------- devis --------------------------------------

interface DemoItemSpec {
  serviceId: string;
  fieldValues: Record<string, string | number | boolean | DimensionValue>;
  montage?: boolean;
}

function buildItem(spec: DemoItemSpec): DevisItem | null {
  const service: Service | undefined = db.services.get(spec.serviceId);
  if (!service) return null;
  const qRaw = spec.fieldValues['quantity'];
  const quantity = typeof qRaw === 'number' ? qRaw : Number(qRaw) || 1;

  let montage: MontageResult | null = null;
  if (spec.montage) {
    const dimsField = service.fields.find((f) => f.type === 'dimensions');
    const dimsVal = dimsField ? spec.fieldValues[dimsField.id] : undefined;
    const dims: DimensionValue =
      typeof dimsVal === 'object' && dimsVal !== null && 'widthMm' in (dimsVal as DimensionValue)
        ? (dimsVal as DimensionValue)
        : service.defaultPieceSize ?? { widthMm: 85, heightMm: 55 };
    const faces = spec.fieldValues['faces'];
    const method: PrintMethod = faces === 'recto' ? 'recto' : 'recto-verso';
    const bleed = service.defaultBleedMm ?? 2;
    montage = computeMontage({
      sheetWidthMm: 320,
      sheetHeightMm: 450,
      pieceWidthMm: dims.widthMm,
      pieceHeightMm: dims.heightMm,
      bleedMm: { top: bleed, bottom: bleed, left: bleed, right: bleed },
      quantity,
      method,
      machineId: 'machine-digital-versant',
    });
  }

  const pricing = priceItem(service, spec.fieldValues, db.currentRules(), montage);
  return {
    id: uid('item'),
    serviceId: service.id,
    serviceName: service.latinName ?? service.name,
    quantity,
    fieldValues: spec.fieldValues,
    montageResult: montage ?? undefined,
    pricing,
    unitPrice: pricing.unitPrice,
    total: pricing.total,
  };
}

interface DemoDevisSpec {
  clientIndex: number;
  projectIndex?: number;
  status: DevisStatus;
  daysAgo: number;
  items: DemoItemSpec[];
}

const DEMO_DEVIS: DemoDevisSpec[] = [
  {
    clientIndex: 3, status: 'done', daysAgo: 38,
    items: [{ serviceId: 'svc-carte-visite', montage: true, fieldValues: { quantity: 500, paper: 'pap-couche-300', faces: 'recto', pelliculage: 'pell-none', 'rounded-corners': false } }],
  },
  {
    clientIndex: 2, status: 'done', daysAgo: 30,
    items: [{ serviceId: 'svc-flyer', montage: true, fieldValues: { quantity: 1000, format: { widthMm: 148, heightMm: 210 }, paper: 'pap-couche-170', faces: 'recto-verso' } }],
  },
  {
    clientIndex: 0, projectIndex: 0, status: 'accepted', daysAgo: 21,
    items: [
      { serviceId: 'svc-carte-visite', montage: true, fieldValues: { quantity: 1000, paper: 'pap-couche-350', faces: 'recto-verso', pelliculage: 'pell-mat', 'rounded-corners': true } },
      { serviceId: 'svc-flyer', montage: true, fieldValues: { quantity: 500, format: { widthMm: 148, heightMm: 210 }, paper: 'pap-couche-170', faces: 'recto-verso' } },
    ],
  },
  {
    clientIndex: 1, status: 'accepted', daysAgo: 14,
    items: [{ serviceId: 'svc-etiquettes', montage: true, fieldValues: { quantity: 2000, format: { widthMm: 60, heightMm: 40 }, paper: 'pap-couche-170', 'contour-cut': true } }],
  },
  {
    clientIndex: 3, projectIndex: 2, status: 'rejected', daysAgo: 9,
    items: [{ serviceId: 'svc-depliant', montage: true, fieldValues: { quantity: 1000, format: { widthMm: 297, heightMm: 210 }, folds: 'fold-3', paper: 'pap-couche-170', faces: 'recto-verso', pelliculage: 'pell-none' } }],
  },
  {
    clientIndex: 2, status: 'sent', daysAgo: 5,
    items: [
      { serviceId: 'svc-flyer', montage: true, fieldValues: { quantity: 2000, format: { widthMm: 105, heightMm: 148 }, paper: 'pap-couche-170', faces: 'recto' } },
      { serviceId: 'svc-etiquettes', montage: true, fieldValues: { quantity: 500, format: { widthMm: 60, heightMm: 40 }, paper: 'pap-couche-170', 'contour-cut': false } },
    ],
  },
  {
    clientIndex: 0, projectIndex: 1, status: 'sent', daysAgo: 2,
    items: [{ serviceId: 'svc-grand-format', fieldValues: { quantity: 2, format: { widthMm: 2000, heightMm: 1000 }, support: 'vinyle', eyelets: true } }],
  },
  {
    clientIndex: 1, status: 'draft', daysAgo: 0,
    items: [{ serviceId: 'svc-carte-visite', montage: true, fieldValues: { quantity: 250, paper: 'pap-couche-350', faces: 'recto', pelliculage: 'pell-none', 'rounded-corners': false } }],
  },
];

export function ensureDemoDevis(): Devis[] {
  db.ensureSeeded();
  ensureDemoClients();
  if (!flagged(DEVIS_FLAG) && db.devis.list().length === 0) {
    const clients = db.clients.list();
    const projects = db.projects.list();
    // create oldest-first so numbers ascend with recency
    [...DEMO_DEVIS]
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .forEach((spec) => {
        const client = clients[spec.clientIndex];
        if (!client) return;
        const items = spec.items.map(buildItem).filter((x): x is DevisItem => x !== null);
        if (items.length === 0) return;
        const createdAt = addDays(new Date().toISOString(), -spec.daysAgo);
        const base: Omit<Devis, 'rulesVersion' | 'rulesSnapshot'> = {
          id: uid('devis'),
          number: db.devis.nextNumber(),
          clientId: client.id,
          projectId: spec.projectIndex !== undefined ? projects[spec.projectIndex]?.id : undefined,
          status: spec.status,
          items,
          total: devisTotals(items).ttc,
          createdAt,
          updatedAt: createdAt,
        };
        // freeze the current rules inside the quote (ثبات الماضي)
        db.devis.create(db.pricingSnapshot(base));
      });
    setFlag(DEVIS_FLAG);
  }
  return db.devis.list();
}
