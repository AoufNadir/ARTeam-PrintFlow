import { computeMontageVariants, cutScoreOf } from '@/lib/montage-engine';
import type { Machine, MontageResult, PricingRule, PrintMethod } from '@/lib/types';
import { formatDA, formatMeasure, formatPercent, trimNumber } from '@/lib/units';
import {
  CUT_METHODS,
  PRINT_METHODS,
  buildEngineInput,
  effectiveMachines,
  estimateCost,
  infeasibilityReason,
  inputsValid,
  sheetSizeMatches,
  type CutMethod,
  type CostEstimate,
  type MontageUIState,
} from './montage-data';

const MAX_REJECTED = 10;

export interface MontageAdvisorChoice {
  id: string;
  rank: number;
  machine: Machine;
  sheetWidthMm: number;
  sheetHeightMm: number;
  method: PrintMethod;
  cutMethod: CutMethod;
  result: Omit<MontageResult, 'alternatives'>;
  cost: CostEstimate;
  score: number;
  cutScore: number;
  variantLabel: string;
  reasons: string[];
  warnings: string[];
}

export interface MontageRejectedCandidate {
  id: string;
  machineName: string;
  sheetLabel: string;
  methodLabel: string;
  cutLabel: string;
  reason: string;
}

export interface MontageAdvisorReport {
  choices: MontageAdvisorChoice[];
  rejected: MontageRejectedCandidate[];
  evaluated: number;
  feasible: number;
}

function labelOfMethod(method: PrintMethod): string {
  return PRINT_METHODS.find((item) => item.id === method)?.label ?? method;
}

function labelOfCut(cut: CutMethod): string {
  return CUT_METHODS.find((item) => item.id === cut)?.latin ?? cut;
}

function resultForCost(result: Omit<MontageResult, 'alternatives'>): MontageResult {
  return { ...result, alternatives: [] };
}

function candidateState(
  state: MontageUIState,
  machine: Machine,
  sheetWidthMm: number,
  sheetHeightMm: number,
  method: PrintMethod,
  cutMethod: CutMethod,
): MontageUIState {
  return {
    ...state,
    kind: machine.kind,
    machineId: machine.id,
    sheetW: sheetWidthMm,
    sheetH: sheetHeightMm,
    method,
    cutMethod,
    customSheet: !machine.sheetSizes.some((sheet) =>
      sheetSizeMatches(machine.kind, sheet.widthMm, sheet.heightMm, sheetWidthMm, sheetHeightMm),
    ),
    autoSuggest: false,
  };
}

function rejectionReason(
  state: MontageUIState,
  machine: Machine,
  sheetWidthMm: number,
  sheetHeightMm: number,
  method: PrintMethod,
  cutMethod: CutMethod,
): string {
  const candidate = candidateState(state, machine, sheetWidthMm, sheetHeightMm, method, cutMethod);
  if (cutMethod === 'guillotine') {
    const looseInput = {
      ...buildEngineInput(candidate),
      cutMethod: 'die-cut' as const,
    };
    if (computeMontageVariants(looseInput, machine).length > 0) {
      return 'المقاس يسع، لكن مخطط القص المستقيم غير مقبول: ليس صفوفاً أو أعمدة أو بلوكات Guillotine.';
    }
  }
  return infeasibilityReason(candidate) ?? 'لم ينتج المحرك مخططاً صالحاً مع هذه الورقة والطريقة والقص.';
}

function explainChoice(choice: Omit<MontageAdvisorChoice, 'rank' | 'reasons' | 'warnings'>, bestCost: number): string[] {
  const cutPattern = choice.result.cutPattern
    ? choice.result.cutPattern === 'rows'
      ? 'قص أفقي'
      : choice.result.cutPattern === 'columns'
        ? 'قص عمودي'
        : 'قص بلوكات'
    : labelOfCut(choice.cutMethod);
  const delta = choice.cost.total - bestCost;
  const priceReason =
    delta <= 0.01
      ? 'أقل تكلفة تقديرية بين المرشحين الصالحين.'
      : `أغلى من الأفضل بـ ${formatDA(delta)} لكنه يبقى بديلاً صالحاً.`;
  return [
    priceReason,
    `${trimNumber(choice.result.copiesPerSheet)} نسخة/ورقة، ${trimNumber(choice.result.sheetsNeeded)} ورقة، هدر ${formatPercent(choice.result.wastePercent)}.`,
    `${labelOfMethod(choice.method)} على ${choice.machine.name}، نمط القص: ${cutPattern}.`,
  ];
}

function warningsForChoice(choice: Omit<MontageAdvisorChoice, 'rank' | 'reasons' | 'warnings'>, state: MontageUIState): string[] {
  const warnings: string[] = [];
  const requested = state.stickers.reduce((sum, sticker) => sum + sticker.quantity, 0);
  const produced = choice.result.sheetsNeeded * choice.result.copiesPerSheet;
  if (state.stickers.length === 1 && produced > requested) {
    warnings.push(`ينتج فائضاً قدره ${trimNumber(produced - requested)} نسخة.`);
  }
  if (choice.result.wastePercent >= 18) warnings.push('الهدر مرتفع؛ راجع ورقة أكبر أو تقسيم الطلبية.');
  if (choice.cutMethod === 'cutcontour' && !state.stickers.some((sticker) => sticker.cutContour || sticker.asset?.hasEmbeddedCutContour)) {
    warnings.push('CutContour مختار لكن لا يوجد ملف tracé مرتبط بعد.');
  }
  if (choice.method === 'bascule' && state.gutterMm <= 0) warnings.push('Bascule بدون مساحة وسطية؛ راجع أمان القلب قبل التنفيذ.');
  return warnings;
}

function scoreChoice(cost: CostEstimate, result: Omit<MontageResult, 'alternatives'>, cutScore: number): number {
  return cost.total + result.sheetsNeeded * 0.25 + result.wastePercent * 4 + cutScore * 0.15;
}

export function computeMontageAdvisor(state: MontageUIState, rules: PricingRule[]): MontageAdvisorReport {
  if (!inputsValid(state) || state.calcMode !== 'quantity') {
    return { choices: [], rejected: [], evaluated: 0, feasible: 0 };
  }

  const machines = effectiveMachines(state);
  const methods = PRINT_METHODS.map((method) => method.id);
  const cutMethods = CUT_METHODS.map((cut) => cut.id);
  const choices: Omit<MontageAdvisorChoice, 'rank' | 'reasons' | 'warnings'>[] = [];
  const rejected: MontageRejectedCandidate[] = [];
  let evaluated = 0;

  for (const machine of machines) {
    for (const sheet of machine.sheetSizes) {
      for (const method of methods) {
        for (const cutMethod of cutMethods) {
          evaluated += 1;
          const input = {
            ...buildEngineInput(state),
            sheetWidthMm: sheet.widthMm,
            sheetHeightMm: sheet.heightMm,
            machineId: machine.id,
            method,
            cutMethod,
          };
          const variants = computeMontageVariants(input, machine);
          const variant = variants[0];
          if (!variant) {
            if (rejected.length < MAX_REJECTED) {
              rejected.push({
                id: `${machine.id}-${sheet.id}-${method}-${cutMethod}`,
                machineName: machine.name,
                sheetLabel: `${formatMeasure(sheet.widthMm, 'cm')}×${formatMeasure(sheet.heightMm, 'cm')}`,
                methodLabel: labelOfMethod(method),
                cutLabel: labelOfCut(cutMethod),
                reason: rejectionReason(state, machine, sheet.widthMm, sheet.heightMm, method, cutMethod),
              });
            }
            continue;
          }
          const cost = estimateCost(resultForCost(variant.result), machine, rules);
          const cutScore = variant.cutScore || cutScoreOf(variant.result.placed);
          choices.push({
            id: `${machine.id}-${sheet.id}-${method}-${cutMethod}-${variant.kind}`,
            machine,
            sheetWidthMm: sheet.widthMm,
            sheetHeightMm: sheet.heightMm,
            method,
            cutMethod,
            result: variant.result,
            cost,
            score: scoreChoice(cost, variant.result, cutScore),
            cutScore,
            variantLabel: variant.label,
          });
        }
      }
    }
  }

  const unique = new Map<string, Omit<MontageAdvisorChoice, 'rank' | 'reasons' | 'warnings'>>();
  for (const choice of choices) {
    const key = [
      choice.machine.id,
      choice.sheetWidthMm,
      choice.sheetHeightMm,
      choice.method,
      choice.cutMethod,
      choice.result.copiesPerSheet,
      choice.result.sheetsNeeded,
      Math.round(choice.result.wastePercent * 10),
    ].join('|');
    const current = unique.get(key);
    if (!current || choice.score < current.score) unique.set(key, choice);
  }

  const sorted = [...unique.values()].sort(
    (a, b) =>
      a.score - b.score ||
      a.cost.total - b.cost.total ||
      a.result.sheetsNeeded - b.result.sheetsNeeded ||
      a.result.wastePercent - b.result.wastePercent,
  );
  const bestCost = sorted[0]?.cost.total ?? 0;
  const top = sorted.slice(0, 3).map((choice, index) => ({
    ...choice,
    rank: index + 1,
    reasons: explainChoice(choice, bestCost),
    warnings: warningsForChoice(choice, state),
  }));

  return { choices: top, rejected, evaluated, feasible: sorted.length };
}
