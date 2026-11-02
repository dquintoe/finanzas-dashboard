/**
 * Repositorio de datos: lee la BD (Google Sheets API v4, solo lectura) y devuelve objetos por cabecera.
 */
import { CONFIG } from './config.js';

export class AccesoDenegado extends Error {}
export class SesionVencida extends Error {}

/** Convierte una matriz [cabecera, ...filas] en objetos. */
export function aObjetos(valores) {
  if (!valores || !valores.length) return [];
  const [cab, ...filas] = valores;
  return filas
    .filter(f => f.some(c => c !== '' && c != null))
    .map(f => Object.fromEntries(cab.map((c, i) => [String(c).trim(), f[i] ?? ''])));
}

async function batchGet(token, rangos) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values:batchGet`);
  rangos.forEach(r => url.searchParams.append('ranges', `'${r}'`));
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER');

  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 400) return null; // alguna hoja no existe (p. ej. Cuentas antes de la migración v2.1)
  if (r.status === 401) throw new SesionVencida('La sesión expiró.');
  if (r.status === 403 || r.status === 404) throw new AccesoDenegado('Tu cuenta no tiene acceso a la base de datos.');
  if (!r.ok) throw new Error(`Error al leer la BD (${r.status}).`);
  const { valueRanges } = await r.json();
  return valueRanges.map(v => aObjetos(v.values));
}

export async function cargarBD(token) {
  const H = CONFIG.HOJAS;
  const base = [H.MOV, H.TAR, H.PRE, H.CRO, H.ING, H.USR, H.CFG];
  // Hojas opcionales: si aún no existen, se lee sin ellas
  let res = await batchGet(token, [...base, H.CTA]);
  const [mov, tar, pre, cro, ing, usr, cfg, cta] = res || [...(await batchGet(token, base) || []), []];
  if (!mov) throw new Error('No se pudo leer la BD (rangos inválidos).');
  return { mov, tar, pre, cro, ing, usr, cfg, cta: cta || [] };
}
