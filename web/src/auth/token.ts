// The JWT lives in memory and in localStorage so a reload keeps the session.
// localStorage is readable by any script on the page; DECISIONS.md records the XSS risk.
const KEY = "quotient.token";
let current: string | null | undefined;

export function readToken(): string | null {
  if (current === undefined) {
    try {
      current = localStorage.getItem(KEY);
    } catch {
      current = null;
    }
  }
  return current;
}

export function writeToken(token: string | null) {
  current = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the session still works until reload.
  }
}
