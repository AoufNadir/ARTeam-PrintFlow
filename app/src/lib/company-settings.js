"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_COMPANY_SETTINGS = void 0;
exports.loadCompanySettings = loadCompanySettings;
const KEY = 'arteam-printflow:settings-company';
exports.DEFAULT_COMPANY_SETTINGS = {
    name: 'مطبعة ARTeam',
    activity: 'digital',
    phone: '021 12 34 56',
    email: 'contact@arteam.dz',
    address: 'حي الأعمال، الجزائر العاصمة',
    currency: 'دج',
};
function loadCompanySettings() {
    if (typeof localStorage === 'undefined')
        return exports.DEFAULT_COMPANY_SETTINGS;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw)
            return exports.DEFAULT_COMPANY_SETTINGS;
        return { ...exports.DEFAULT_COMPANY_SETTINGS, ...JSON.parse(raw) };
    }
    catch {
        return exports.DEFAULT_COMPANY_SETTINGS;
    }
}
