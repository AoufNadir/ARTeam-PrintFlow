export interface CompanySettings {
  name: string;
  activity: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  logo?: string;
  legal?: string;
}

const KEY = 'arteam-printflow:settings-company';

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  name: 'مطبعة ARTeam',
  activity: 'digital',
  phone: '021 12 34 56',
  email: 'contact@arteam.dz',
  address: 'حي الأعمال، الجزائر العاصمة',
  currency: 'دج',
};

export function loadCompanySettings(): CompanySettings {
  if (typeof localStorage === 'undefined') return DEFAULT_COMPANY_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_COMPANY_SETTINGS;
    return { ...DEFAULT_COMPANY_SETTINGS, ...(JSON.parse(raw) as Partial<CompanySettings>) };
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}
