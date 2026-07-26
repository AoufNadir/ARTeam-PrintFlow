"use strict";
// ---------------------------------------------------------------------------
// Session helpers — shared by the route guard (App), Login and Topbar.
// Kept out of component files so those files only export components
// (react-refresh/only-export-components).
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_KEY = void 0;
exports.hasSession = hasSession;
exports.SESSION_KEY = 'arteam-printflow:session';
/** True when a session blob exists in localStorage. */
function hasSession() {
    try {
        return !!localStorage.getItem(exports.SESSION_KEY);
    }
    catch {
        return false;
    }
}
