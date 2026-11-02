/**
 * Vistas: formateo y renderizado de KPIs y tablas (sin lógica de negocio).
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtMoneda(n, moneda = 'PEN', compacto = false) {
  const simbolo = moneda === 'USD' ? 'US$ ' : 'S/ ';
  const v = Number(n) || 0;
  if (compacto && Math.abs(v) >= 1000) return simbolo + (v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 }) + ' mil';
  return simbolo + v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const fmtFecha = d => d ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function nombreMes(periodo, corto = false) {
  const [a, m] = String(periodo).split('-').map(Number);
  const n = MESES[m - 1] || periodo;
  return corto ? `${n.slice(0, 3)} ${String(a).slice(2)}` : `${n[0].toUpperCase()}${n.slice(1)} ${a}`;
}

const tabla = (cab, filas, vacio = 'Sin datos') => filas.length
  ? `<div class="tabla-envoltura"><table><thead><tr>${cab.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`
  : `<p class="nota">${esc(vacio)}</p>`;

function kpi(etq, val, det = '', estado = null) {
  const est = estado ? `<div class="estado ${estado.tipo}"><span class="punto"></span>${esc(estado.texto)}</div>` : '';
  return `<div class="kpi"><div class="etq">${esc(etq)}</div><div class="val">${val}</div>${det ? `<div class="det">${det}</div>` : ''}${est}</div>`;
}

export function renderKpis(el, r, deuda, pagos, moneda, totalRevisar) {
  const pagos30 = pagos.filter(p => p.vencida || p.porConfirmar || p.diasRestantes <= 30);
  const sumaPagos = pagos30.reduce((s, p) => s + (moneda === 'USD' ? (p.montoUSD || 0) : (p.montoPEN || 0)), 0);
  const vencidas = pagos.filter(p => p.vencida).length;
  const deudaVal = moneda === 'USD' ? deuda.deudaTarjetasUSD : deuda.deudaTotalPEN;
  el.innerHTML = [
    kpi('Ingresos del mes', fmtMoneda(r.ingresos + r.otrosIngresos, moneda),
      [r.abonoSueldo ? `abono real del sueldo en cuenta: ${fmtMoneda(r.abonoSueldo, moneda)}` : '',
       r.otrosIngresos ? `incluye ${fmtMoneda(r.otrosIngresos, moneda)} de reembolsos` : '', r.cts ? `CTS aparte: ${fmtMoneda(r.cts, moneda)}` : ''].filter(Boolean).join(' · '),
      r.adelantos ? { tipo: 'critico', texto: `Adelantos de sueldo: ${fmtMoneda(r.adelantos, moneda)}` } : null),
    kpi('Gastos del mes', fmtMoneda(r.gastos, moneda), `${r.movimientos} movimientos`),
    kpi('Flujo neto estimado', fmtMoneda(r.flujo, moneda),
      'ingresos − gastos − capital y cuotas de préstamos',
      r.ingresos ? (r.flujo >= 0 ? { tipo: 'bueno', texto: `Ahorro ${r.tasaAhorro}% del ingreso` } : { tipo: 'critico', texto: 'Gastas más de lo que ingresa' }) : null),
    kpi(moneda === 'USD' ? 'Deuda en tarjetas (USD)' : 'Deuda total', fmtMoneda(deudaVal, moneda),
      moneda === 'USD' ? '' : `tarjetas ${fmtMoneda(deuda.deudaTarjetasPEN, 'PEN', true)} · préstamos ${fmtMoneda(deuda.deudaPrestamosPEN, 'PEN', true)}`),
    kpi('Pagos próximos 30 días', fmtMoneda(sumaPagos, moneda), `${pagos30.length} pagos`,
      vencidas ? { tipo: 'critico', texto: `${vencidas} cuota(s) vencida(s)` } : { tipo: 'bueno', texto: 'Sin cuotas vencidas' }),
    kpi('Por clasificar', String(totalRevisar), `${r.revisar} en este mes`,
      totalRevisar ? { tipo: 'aviso', texto: 'Clasificar en el Sheet' } : { tipo: 'bueno', texto: 'Todo clasificado' })
  ].join('');
}

export function renderPagos(el, pagos) {
  el.innerHTML = tabla([{ t: 'Fecha' }, { t: 'Concepto' }, { t: 'Monto', num: true }, { t: '' }],
    pagos.map(p => {
      const est = p.vencida ? '<span class="etiqueta critico">Vencida</span>'
        : p.porConfirmar ? '<span class="etiqueta aviso">Confirmar pago</span>'
        : p.diasRestantes <= 7 ? `<span class="etiqueta aviso">En ${p.diasRestantes} días</span>` : `<span class="etiqueta">En ${p.diasRestantes} días</span>`;
      const monto = [p.montoPEN ? fmtMoneda(p.montoPEN) : '', p.montoUSD ? fmtMoneda(p.montoUSD, 'USD') : ''].filter(Boolean).join(' + ');
      const min = p.minimoPEN ? `<div class="nota">mín. ${fmtMoneda(p.minimoPEN)}</div>` : '';
      return `<tr><td>${fmtFecha(p.fecha)}</td><td>${esc(p.concepto)}</td><td class="num">${monto}${min}</td><td>${est}</td></tr>`;
    }), 'No hay pagos en los próximos 45 días');
}

export function renderContrapartes(el, top, moneda) {
  el.innerHTML = tabla([{ t: 'Contraparte' }, { t: 'Categoría' }, { t: 'Mov.', num: true }, { t: 'Monto', num: true }],
    top.map(c => `<tr><td>${esc(c.contraparte)}</td><td>${esc(c.categoria)}</td><td class="num">${c.n}</td><td class="num">${fmtMoneda(c.monto, moneda)}</td></tr>`));
}

export function renderTarjetas(el, deuda) {
  el.innerHTML = tabla(
    [{ t: 'Tarjeta' }, { t: 'Periodo' }, { t: 'Deuda', num: true }, { t: 'Línea', num: true }, { t: 'Uso' }, { t: 'Pago del mes', num: true }, { t: 'Pago mínimo', num: true }, { t: 'Vence' }],
    deuda.tarjetas.map(t => {
      const uso = t.utilizacion == null ? '<span class="nota">—</span>'
        : `<div class="barra-uso ${t.utilizacion >= 70 ? 'alto' : ''}" title="${t.utilizacion.toFixed(0)}%"><span style="width:${t.utilizacion.toFixed(1)}%"></span></div><span class="nota">${t.utilizacion.toFixed(0)}%</span>`;
      const usd = t.deudaUSD ? `<div class="nota">+ ${fmtMoneda(t.deudaUSD, 'USD')}</div>` : '';
      const linea = /USD/.test(t.notas) ? fmtMoneda(t.linea, 'USD') : fmtMoneda(t.linea);
      return `<tr><td><b>${esc(t.entidad)}</b> ${esc(t.producto)} ${esc(t.tarjeta)}${t.notas ? `<div class="nota">${esc(t.notas)}</div>` : ''}</td>
        <td>${esc(t.periodo)}</td><td class="num">${fmtMoneda(t.deudaPEN)}${usd}</td><td class="num">${linea}</td><td>${uso}</td>
        <td class="num">${fmtMoneda(t.pagoMesPEN)}${t.pagoMesUSD ? `<div class="nota">+ ${fmtMoneda(t.pagoMesUSD, 'USD')}</div>` : ''}</td>
        <td class="num">${fmtMoneda(t.pagoMinPEN)}</td><td>${fmtFecha(t.ultimoDiaPago)}</td></tr>`;
    }));
}

export function renderPrestamos(el, deuda) {
  el.innerHTML = tabla(
    [{ t: 'Préstamo' }, { t: 'Saldo', num: true }, { t: 'Cuota', num: true }, { t: 'Avance' }, { t: 'TEA', num: true }, { t: 'Próx. venc.' }],
    deuda.prestamos.map(p => {
      const av = p.total ? Math.min(100, (p.pagadas / p.total) * 100) : 0;
      const alerta = /vencid/i.test(p.notas) ? '<span class="etiqueta critico">Cuota vencida</span> ' : '';
      const dentro = p.dentroDeTarjeta ? '<div class="nota">Incluido en la deuda de su tarjeta</div>' : '';
      return `<tr><td>${alerta}<b>${esc(p.entidad)}</b> ${esc(p.producto)}${dentro}</td>
        <td class="num">${p.saldo ? fmtMoneda(p.saldo) : '<span class="nota">no informado</span>'}</td><td class="num">${fmtMoneda(p.cuota)}</td>
        <td><div class="barra-uso" title="${p.pagadas} de ${p.total} cuotas"><span style="width:${av.toFixed(1)}%"></span></div><span class="nota">${p.pagadas}/${p.total} cuotas</span></td>
        <td class="num">${p.tea ? (p.tea * 100).toFixed(2) + '%' : '—'}</td><td>${fmtFecha(p.proximo)}</td></tr>`;
    }));
}

export function renderMovimientos(el, filas, pagina, porPagina) {
  const ini = pagina * porPagina;
  el.innerHTML = tabla(
    [{ t: 'Fecha' }, { t: 'Tipo' }, { t: 'Categoría' }, { t: 'Descripción' }, { t: 'Contraparte' }, { t: 'Medio' }, { t: 'Monto', num: true }, { t: 'Estado' }],
    filas.slice(ini, ini + porPagina).map(m => `<tr class="${m.Estado_Clasificacion === 'Revisar' ? 'revisar' : ''}">
      <td>${fmtFecha(m.Fecha)}</td><td>${esc(m.Tipo)}</td><td>${esc(m.Categoria)}<div class="nota">${esc(m.Subcategoria)}</div></td>
      <td>${esc(m.Descripcion)}</td><td>${esc(m.Contraparte)}</td><td>${esc(m.Medio_Pago)}</td>
      <td class="num">${fmtMoneda(m.Monto, m.Moneda)}</td><td><span class="etiqueta ${m.Estado_Clasificacion === 'Revisar' ? 'aviso' : ''}">${esc(m.Estado_Clasificacion)}</span></td></tr>`),
    'No hay movimientos con estos filtros');
}

export function renderCuentas(el, cuentas) {
  el.innerHTML = tabla([{ t: 'Cuenta' }, { t: 'Al' }, { t: 'Saldo contable', num: true }, { t: 'Saldo disponible', num: true }],
    cuentas.map(c => `<tr><td><b>${esc(c.entidad)}</b> ${esc(c.producto)} ${esc(c.cuenta)}</td><td>${fmtFecha(c.fecha)}</td>
      <td class="num">${fmtMoneda(c.saldoContable, c.moneda)}</td><td class="num">${fmtMoneda(c.saldoDisponible, c.moneda)}</td></tr>`),
    'Aún no hay constancias de cuenta cargadas');
}

const pct = (x, base) => base ? `${((x / base) * 100).toFixed(1)}% de la remuneración` : '';

const detalleExtras = b => [['Gratificación', b.grat], ['Bonif. extraordinaria', b.bonif], ['CTS', b.cts], ['Utilidades', b.util]]
  .filter(([, v]) => v).map(([t, v]) => `${t} ${fmtMoneda(v, 'PEN', true)}`).join(' · ');

/** Ingresos de la boleta (haberes): remuneración fija y conceptos extra. */
export function renderIngresosBoleta(elKpis, elTabla, boletas, boleta, acum, periodo) {
  if (!boleta) { elKpis.innerHTML = '<p class="nota">No hay boletas cargadas hasta este periodo.</p>'; elTabla.innerHTML = ''; return; }
  elKpis.innerHTML = [
    kpi('Remuneración básica', fmtMoneda(boleta.basica), pct(boleta.basica, boleta.remuneracion)),
    kpi('Asignación familiar', fmtMoneda(boleta.asig), pct(boleta.asig, boleta.remuneracion)),
    kpi('Condición de trabajo', fmtMoneda(boleta.cond), pct(boleta.cond, boleta.remuneracion)),
    kpi('Ingresos extras del mes', fmtMoneda(boleta.extras), detalleExtras(boleta) || 'sin gratificación, bonos, CTS ni utilidades este mes'),
    kpi('Total ingresos de la boleta', fmtMoneda(boleta.haberes), 'remuneración + ingresos extras'),
    kpi(`Ingresos extras ${periodo.slice(0, 4)} (${acum.meses} boletas)`, fmtMoneda(acum.extras), detalleExtras(acum) || '—')
  ].join('');
  const c = v => `<td class="num">${v ? fmtMoneda(v) : '—'}</td>`;
  elTabla.innerHTML = tabla(
    [{ t: 'Mes' }, { t: 'Rem. básica', num: true }, { t: 'Asig. familiar', num: true }, { t: 'Cond. trabajo', num: true }, { t: 'Gratificación', num: true },
     { t: 'Bonif. extraord.', num: true }, { t: 'CTS', num: true }, { t: 'Utilidades', num: true }, { t: 'Total ingresos', num: true }, { t: '' }],
    [...boletas.slice().reverse().map(b => `<tr><td>${esc(nombreMes(b.periodo, true))}</td>${c(b.basica)}${c(b.asig)}${c(b.cond)}${c(b.grat)}${c(b.bonif)}${c(b.cts)}${c(b.util)}
      <td class="num"><b>${fmtMoneda(b.haberes)}</b></td><td>${b.estado === 'Estimado' ? '<span class="etiqueta aviso">Estimado</span>' : ''}</td></tr>`),
     `<tr class="total"><td><b>Total ${periodo.slice(0, 4)}</b></td>${c(acum.basica)}${c(acum.asig)}${c(acum.cond)}${c(acum.grat)}${c(acum.bonif)}${c(acum.cts)}${c(acum.util)}
      <td class="num"><b>${fmtMoneda(acum.haberes)}</b></td><td></td></tr>`],
    'No hay boletas cargadas');
}

export function renderRemuneracion(elKpis, elTabla, elNota, boletas, boleta, acum, periodo) {
  if (!boleta) {
    elKpis.innerHTML = '<p class="nota">No hay boletas cargadas hasta este periodo.</p>'; elTabla.innerHTML = ''; elNota.textContent = '';
    return;
  }
  const otroMes = boleta.periodo !== periodo ? ` (boleta de ${nombreMes(boleta.periodo)}: aún no hay la de ${nombreMes(periodo)})` : '';
  elNota.textContent = `${nombreMes(boleta.periodo)}${boleta.estado === 'Estimado' ? ' · ESTIMADO (igual a la última boleta real)' : ''}${otroMes}`;
  elKpis.innerHTML = [
    kpi('Remuneración del mes', fmtMoneda(boleta.remuneracion), 'básico + asignación familiar + condición de trabajo'),
    kpi('SPP (AFP)', fmtMoneda(boleta.spp), pct(boleta.spp, boleta.remuneracion)),
    kpi('Renta de 5ta categoría', fmtMoneda(boleta.renta5), pct(boleta.renta5, boleta.remuneracion)),
    kpi('Descuento seguros (EPS)', fmtMoneda(boleta.eps), pct(boleta.eps, boleta.remuneracion)),
    kpi('Neto recibido', fmtMoneda(boleta.neto), `descuentos totales ${fmtMoneda(boleta.descuentos)} (${((boleta.descuentos / boleta.remuneracion) * 100).toFixed(1)}%)`,
      boleta.cuadra ? { tipo: 'bueno', texto: 'Cuadra con la boleta' } : { tipo: 'critico', texto: 'No cuadra: revisar boleta' }),
    kpi(`Acumulado ${periodo.slice(0, 4)} (${acum.meses} boletas)`, fmtMoneda(acum.spp + acum.renta5 + acum.eps + acum.otros),
      `SPP ${fmtMoneda(acum.spp, 'PEN', true)} · Renta 5ta ${fmtMoneda(acum.renta5, 'PEN', true)} · EPS ${fmtMoneda(acum.eps, 'PEN', true)}`)
  ].join('');
  elTabla.innerHTML = tabla(
    [{ t: 'Mes' }, { t: 'Remuneración', num: true }, { t: 'SPP (AFP)', num: true }, { t: 'Renta 5ta', num: true }, { t: 'Seguros (EPS)', num: true },
     { t: 'Otros', num: true }, { t: 'Total desc.', num: true }, { t: 'Neto', num: true }, { t: '' }],
    boletas.slice().reverse().map(b => `<tr><td>${esc(nombreMes(b.periodo, true))}</td><td class="num">${fmtMoneda(b.remuneracion)}</td>
      <td class="num">${fmtMoneda(b.spp)}</td><td class="num">${fmtMoneda(b.renta5)}</td><td class="num">${fmtMoneda(b.eps)}</td>
      <td class="num">${fmtMoneda(b.otros)}</td><td class="num">${fmtMoneda(b.descuentos)}</td><td class="num"><b>${fmtMoneda(b.neto)}</b></td>
      <td>${b.estado === 'Estimado' ? '<span class="etiqueta aviso">Estimado</span>' : ''}${b.cuadra ? '' : ' <span class="etiqueta critico">No cuadra</span>'}</td></tr>`),
    'No hay boletas cargadas');
}
