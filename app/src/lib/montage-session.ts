import type { MontageInput, MontageResult, PlacedPiece } from './types';

const SESSION_PREFIX = 'arteam-printflow:montage-session:';
const COMMIT_PREFIX = 'arteam-printflow:montage-session-commit:';

export interface MontageBridgeSession<TState = unknown, TPayload = unknown> {
  id: string;
  source: 'devis' | 'studio';
  returnTo: string;
  createdAt: string;
  state: TState;
  payload?: TPayload;
}

export interface MontageBridgeCommit<TState = unknown, TPayload = unknown> {
  session: MontageBridgeSession<TState, TPayload>;
  result: MontageResult;
  placed: PlacedPiece[];
  input: MontageInput;
  state: TState;
  savedAt: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function makeMontageSessionId(): string {
  return `ms-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

export function saveMontageSession<TState, TPayload>(session: MontageBridgeSession<TState, TPayload>): void {
  localStorage.setItem(`${SESSION_PREFIX}${session.id}`, JSON.stringify(session));
}

export function getMontageSession<TState = unknown, TPayload = unknown>(
  id: string | null | undefined,
): MontageBridgeSession<TState, TPayload> | null {
  if (!id) return null;
  return readJson<MontageBridgeSession<TState, TPayload>>(`${SESSION_PREFIX}${id}`);
}

export function commitMontageSession<TState, TPayload>(
  id: string,
  commit: Omit<MontageBridgeCommit<TState, TPayload>, 'session'>,
): MontageBridgeCommit<TState, TPayload> | null {
  const session = getMontageSession<TState, TPayload>(id);
  if (!session) return null;
  const full: MontageBridgeCommit<TState, TPayload> = { ...commit, session };
  localStorage.setItem(`${COMMIT_PREFIX}${id}`, JSON.stringify(full));
  return full;
}

export function consumeMontageCommit<TState = unknown, TPayload = unknown>(
  id: string | null | undefined,
): MontageBridgeCommit<TState, TPayload> | null {
  if (!id) return null;
  const key = `${COMMIT_PREFIX}${id}`;
  const commit = readJson<MontageBridgeCommit<TState, TPayload>>(key);
  localStorage.removeItem(key);
  localStorage.removeItem(`${SESSION_PREFIX}${id}`);
  return commit;
}

export function appendQueryParam(url: string, key: string, value: string): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(key, value);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}
