// Migration flow check — bundled with esbuild and run with node.
import { migrateStateDraft } from '../src/components/montage/montage-migrate';
import { INITIAL_STATE } from '../src/components/montage/montage-data';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}`, extra ?? '');
  }
}

// ---- 1) legacy draft: primary + extras, shared bleed -----------------------
const legacy = {
  kind: 'offset',
  machineId: 'mc-heidelberg',
  margins: { top: 8, bottom: 8, left: 8, right: 8 },
  pinceMm: 12,
  sheetW: 500,
  sheetH: 700,
  customSheet: false,
  autoSuggest: false,
  pieceW: 90,
  pieceH: 55,
  bleed: { top: 2, bottom: 2, left: 2, right: 2 },
  quantity: 2500,
  method: 'bascule',
  gutterMm: 12,
  cutMethod: 'die-cut',
  sharedCut: true,
  doubleCut: false,
  manualMode: false,
  manualCopies: 12,
  extraGroups: [
    { id: 'gx-abc', widthMm: 70, heightMm: 40, quantity: 500 },
    { id: 'gx-def', widthMm: 60, heightMm: 60, quantity: 300 },
  ],
};
const m1 = migrateStateDraft(JSON.parse(JSON.stringify(legacy)));
check('legacy: migrated (not null)', m1 !== null);
if (m1) {
  check('legacy: stickers count = 3', m1.stickers.length === 3, m1.stickers);
  check('legacy: primary id kept', m1.stickers[0].id === 'g1');
  check('legacy: primary dims', m1.stickers[0].widthMm === 90 && m1.stickers[0].heightMm === 55);
  check('legacy: primary qty', m1.stickers[0].quantity === 2500);
  check('legacy: primary bleed = shared', m1.stickers[0].bleed.top === 2 && m1.stickers[0].bleedLinked === true);
  check('legacy: bleedShared from legacy bleed', m1.bleedShared.top === 2);
  check('legacy: extras preserved', m1.stickers[1].id === 'gx-abc' && m1.stickers[2].id === 'gx-def');
  check('legacy: extras linked to shared bleed', m1.stickers[1].bleedLinked && m1.stickers[1].bleed.left === 2);
  check('legacy: extra qty', m1.stickers[2].quantity === 300);
  check('legacy: unrelated fields kept', m1.kind === 'offset' && m1.machineId === 'mc-heidelberg' && m1.method === 'bascule');
  check('legacy: manualCopies kept', m1.manualCopies === 12);
  check('legacy: old fields absent', !('pieceW' in m1) && !('extraGroups' in m1) && !('bleed' in m1) && !('quantity' in m1));
}

// ---- 2) new-shape draft: sanitized, unlinked bleed preserved ---------------
const fresh = {
  ...INITIAL_STATE,
  sheetW: 330,
  sheetH: 480,
  bleedShared: { top: 5, bottom: 5, left: 5, right: 5 },
  stickers: [
    { id: 'g1', widthMm: 100, heightMm: 50, bleed: { top: 5, bottom: 5, left: 5, right: 5 }, bleedLinked: true, quantity: 800 },
    { id: 'st-xyz', widthMm: 45, heightMm: 45, bleed: { top: 1, bottom: 2, left: 3, right: 4 }, bleedLinked: false, quantity: 200 },
  ],
};
const m2 = migrateStateDraft(JSON.parse(JSON.stringify(fresh)));
check('new: migrated (not null)', m2 !== null);
if (m2) {
  check('new: stickers count = 2', m2.stickers.length === 2);
  check('new: unlinked custom bleed preserved', JSON.stringify(m2.stickers[1].bleed) === JSON.stringify({ top: 1, bottom: 2, left: 3, right: 4 }), m2.stickers[1].bleed);
  check('new: bleedShared preserved', m2.bleedShared.top === 5);
  check('new: dims kept', m2.sheetW === 330 && m2.sheetH === 480);
}

// ---- 3) round-trip: migrated output re-migrates to itself -------------------
const m3 = m1 ? migrateStateDraft(JSON.parse(JSON.stringify(m1))) : null;
check('round-trip: stable', m3 !== null && JSON.stringify(m3) === JSON.stringify(m1));

// ---- 4) garbage / unusable drafts ------------------------------------------
check('garbage: null on non-object', migrateStateDraft('nope') === null);
check('garbage: null on empty object', migrateStateDraft({}) === null);
check('garbage: null on empty stickers', migrateStateDraft({ stickers: [] }) === null);

// ---- 5) legacy without extras ----------------------------------------------
const m5 = migrateStateDraft({ pieceW: 89, pieceH: 89, bleed: { top: 3, bottom: 3, left: 3, right: 3 }, quantity: 1000 });
check('legacy minimal: single sticker', m5 !== null && m5.stickers.length === 1 && m5.stickers[0].id === 'g1');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
