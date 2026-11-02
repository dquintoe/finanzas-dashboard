/**
 * Autenticación con Google Identity Services (OAuth 2.0, flujo de token en el navegador).
 * El token vive solo en memoria y en sessionStorage (se borra al cerrar la pestaña).
 */
import { CONFIG } from './config.js';

const CLAVE = 'fin_token';
let tokenClient = null;
let sesion = null; // { token, expira, email }

function leerGuardada() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    return s && s.expira > Date.now() + 60_000 ? s : null;
  } catch { return null; }
}

function guardar(s) {
  try { sessionStorage.setItem(CLAVE, JSON.stringify(s)); } catch { /* modo privado */ }
}

function esperarGIS() {
  return new Promise((ok, ko) => {
    const t0 = Date.now();
    (function chequear() {
      if (window.google?.accounts?.oauth2) return ok();
      if (Date.now() - t0 > 10_000) return ko(new Error('No se pudo cargar Google Identity Services.'));
      setTimeout(chequear, 100);
    })();
  });
}

async function obtenerEmail(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('No se pudo obtener el correo de la cuenta.');
  return (await r.json()).email;
}

export const Auth = {
  /** Sesión vigente (si la pestaña ya estaba autenticada). */
  actual() { sesion = sesion || leerGuardada(); return sesion; },

  async iniciar() {
    await esperarGIS();
    if (CONFIG.CLIENT_ID.startsWith('PEGAR_AQUI')) throw new Error('Falta configurar CLIENT_ID en assets/js/config.js');
  },

  /** Abre el selector de cuentas de Google y devuelve la sesión. */
  ingresar(promptMode = 'select_account') {
    return new Promise((ok, ko) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: async resp => {
          if (resp.error) return ko(new Error(resp.error_description || resp.error));
          try {
            const email = await obtenerEmail(resp.access_token);
            sesion = { token: resp.access_token, expira: Date.now() + Number(resp.expires_in) * 1000, email };
            guardar(sesion);
            ok(sesion);
          } catch (e) { ko(e); }
        },
        error_callback: e => ko(new Error(e.message || 'Ingreso cancelado'))
      });
      tokenClient.requestAccessToken({ prompt: promptMode });
    });
  },

  salir() {
    const s = this.actual();
    if (s?.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(s.token, () => {});
    sesion = null;
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
  }
};
