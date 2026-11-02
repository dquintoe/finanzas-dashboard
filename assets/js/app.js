/**
 * Controlador: autenticación → carga de la BD → autorización por rol → render y filtros.
 */
import { CONFIG } from './config.js';
import { Auth } from './auth.js';
import { cargarBD, AccesoDenegado, SesionVencida } from './sheetsRepo.js';
import * as M from './model.js';
import * as V from './views.js';
import { graficoEvolucion, graficoCategorias, graficoDescuentos, graficoIngresosBoleta } from './charts.js';

const $ = id => document.getElementById(id);
const POR_PAGINA = 50;
const estado = { datos: null, movs: [], deuda: null, pagos: [], periodo: null, moneda: 'PEN', pagina: 0, rol: null };

function mostrar(vista) {
  ['v-login', 'v-denegado', 'v-cargando', 'v-app'].forEach(v => { $(v).hidden = v !== vista; });
}

async function arrancar() {
  try { await Auth.iniciar(); } catch (e) { mostrar('v-login'); $('login-error').textContent = e.message; return; }
  const s = Auth.actual();
  if (s) await abrir(s); else mostrar('v-login');
}

async function ingresar(prompt) {
  $('login-error').textContent = '';
  try { await abrir(await Auth.ingresar(prompt)); }
  catch (e) { mostrar('v-login'); $('login-error').textContent = e.message; }
}

async function abrir(sesion) {
  mostrar('v-cargando');
  try {
    const datos = await cargarBD(sesion.token);
    const rol = M.rolDe(datos.usr, sesion.email);
    if (!rol) throw new AccesoDenegado(`La cuenta ${sesion.email} no está activa en la lista de usuarios.`);
    Object.assign(estado, { datos, rol });
    prepararDatos();
    configurarCabecera(sesion.email, rol);
    mostrar('v-app');
    render();
  } catch (e) {
    if (e instanceof SesionVencida) { Auth.salir(); mostrar('v-login'); return; }
    if (e instanceof AccesoDenegado) { $('denegado-msg').textContent = e.message; Auth.salir(); mostrar('v-denegado'); return; }
    mostrar('v-login'); $('login-error').textContent = e.message;
  }
}

function prepararDatos() {
  const d = estado.datos;
  estado.movs = M.normalizarMovimientos(d.mov);
  estado.deuda = M.resumenDeuda(d.tar, d.pre);
  estado.pagos = M.proximosPagos(estado.deuda, d.cro, new Date());
  const ps = M.periodos(estado.movs);
  estado.periodo = estado.periodo && ps.includes(estado.periodo) ? estado.periodo : M.periodoPorDefecto(estado.movs);
  $('f-periodo').innerHTML = ps.slice().reverse().map(p => `<option value="${p}">${V.nombreMes(p)}</option>`).join('');
  $('f-periodo').value = estado.periodo;
  const cats = [...new Set(estado.movs.map(m => m.Categoria).filter(Boolean))].sort();
  $('f-categoria').innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option>${V.esc(c)}</option>`).join('');
  const cfg = Object.fromEntries(d.cfg.map(r => [r.Clave, r.Valor]));
  $('pie').textContent = `Última actualización de la BD: ${cfg.ultima_carga || '—'} · Montos tal como figuran en los estados de cuenta (PEN y USD sin conversión).`;
}

function configurarCabecera(email, rol) {
  $('chip-usuario').innerHTML = `${V.esc(email)} · <b>${V.esc(rol)}</b>`;
  const esAdmin = rol === 'Administrador';
  $('acciones-admin').hidden = !esAdmin;
  if (esAdmin) {
    const volver = encodeURIComponent(location.origin + location.pathname);
    $('lnk-actualizar').href = `${CONFIG.WEBAPP_URL}?accion=actualizar&volver=${volver}`;
    $('lnk-estado').href = `${CONFIG.WEBAPP_URL}?accion=estado&volver=${volver}`;
    $('lnk-usuarios').href = `${CONFIG.WEBAPP_URL}?accion=usuarios&volver=${volver}`;
  }
}

function render() {
  const { movs, periodo, moneda, deuda, pagos } = estado;
  const r = M.resumenPeriodo(movs, periodo, moneda);
  const totalRevisar = movs.filter(m => m.Estado_Clasificacion === 'Revisar').length;
  V.renderKpis($('kpis'), r, deuda, pagos, moneda, totalRevisar);
  $('cobertura').textContent = `Fuentes del mes: ${M.coberturaFuentes(movs, periodo).join(', ') || '—'}`;

  const evo = M.evolucionMensual(movs, moneda);
  $('nota-evo').textContent = 'Los meses sin estado de cuenta solo incluyen Yape';
  const cats = M.gastosPorCategoria(movs, periodo, moneda);
  $('nota-cat').textContent = `${V.nombreMes(periodo)} · total ${V.fmtMoneda(r.gastos, moneda)}`;
  if (window.Chart) { graficoEvolucion(evo, moneda, periodo); graficoCategorias(cats, moneda); }

  V.renderPagos($('t-pagos'), pagos);
  V.renderContrapartes($('t-contrapartes'), M.topContrapartes(movs, periodo, moneda), moneda);
  V.renderTarjetas($('t-tarjetas'), deuda);
  V.renderPrestamos($('t-prestamos'), deuda);
  V.renderCuentas($('t-cuentas'), M.resumenCuentas(estado.datos.cta || []));

  const boletas = M.resumenBoletas(estado.datos.ing || []);
  const boleta = M.boletaDelPeriodo(boletas, periodo), acum = M.acumuladoAnual(boletas, periodo);
  V.renderIngresosBoleta($('kpis-ing-boleta'), $('t-ing-boletas'), boletas, boleta, acum, periodo);
  V.renderRemuneracion($('kpis-boleta'), $('t-boletas'), $('nota-boleta'), boletas, boleta, acum, periodo);
  if (window.Chart && boletas.length) { graficoIngresosBoleta(boletas); graficoDescuentos(boletas); }
  renderTablaMov();
}

function renderTablaMov() {
  const filas = M.filtrarMovimientos(estado.movs, {
    periodo: estado.periodo, moneda: estado.moneda, texto: $('f-texto').value,
    soloRevisar: $('f-revisar').checked, categoria: $('f-categoria').value
  });
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  estado.pagina = Math.min(estado.pagina, paginas - 1);
  V.renderMovimientos($('t-movimientos'), filas, estado.pagina, POR_PAGINA);
  $('cuenta-mov').textContent = `${filas.length} movimientos`;
  $('pag-info').textContent = `Página ${estado.pagina + 1} de ${paginas}`;
  $('pag-ant').disabled = estado.pagina === 0;
  $('pag-sig').disabled = estado.pagina >= paginas - 1;
}

/* Eventos */
$('btn-ingresar').addEventListener('click', () => ingresar('select_account'));
$('btn-otra-cuenta').addEventListener('click', () => ingresar('select_account'));
$('btn-salir').addEventListener('click', () => { Auth.salir(); mostrar('v-login'); });
$('btn-recargar').addEventListener('click', () => { const s = Auth.actual(); s ? abrir(s) : mostrar('v-login'); });
$('f-periodo').addEventListener('change', e => { estado.periodo = e.target.value; estado.pagina = 0; render(); });
document.querySelectorAll('.segmento button').forEach(b => b.addEventListener('click', () => {
  estado.moneda = b.dataset.moneda; estado.pagina = 0;
  document.querySelectorAll('.segmento button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render();
}));
['f-texto', 'f-categoria', 'f-revisar'].forEach(id => $(id).addEventListener('input', () => { estado.pagina = 0; renderTablaMov(); }));
$('pag-ant').addEventListener('click', () => { estado.pagina--; renderTablaMov(); });
$('pag-sig').addEventListener('click', () => { estado.pagina++; renderTablaMov(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => estado.datos && render());

arrancar();
