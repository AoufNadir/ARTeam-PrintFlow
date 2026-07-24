// ---------------------------------------------------------------------------
// Session helpers — shared by the route guard (App), Login and Topbar.
// Kept out of component files so those files only export components
// (react-refresh/only-export-components).
// ---------------------------------------------------------------------------

export const SESSION_KEY = 'arteam-printflow:session';

/** True when a session blob exists in localStorage. */
export function hasSession(): boolean {
  try {
    return !!localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
}
