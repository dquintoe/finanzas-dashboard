/**
 * Modelo de dominio (lógica pura, sin DOM ni red → probado con Node en tests/).
 * Reglas de negocio de los indicadores:
 *  - Gasto: Tipo "Gasto". "Pago deuda" (pago de tarjeta) NO es gasto: los consumos ya se contaron.
 *  - Ingreso: Tipo "Ingreso" sin CTS (CTS va a una cuenta intangible) + "Reembolso" como otros ingresos.
 *  - Flujo neto = Ingresos + Otros ingresos − Gastos − Capital de cuotas (ExtraCash/Rapicash)
 *                 − Cuotas de préstamos pagadas.
 *  - Cuenta bancaria: "Abono sueldo" (depósito real) se muestra para conciliar con la boleta, sin sumarse dos veces;
 *    "Adelanto de sueldo" es deuda recibida, no ingreso; transferencias a cuentas propias no son gasto.
 *  - Deuda: última foto de cada tarjeta + saldo de préstamos que NO están dentro de una tarjeta
 *           (ExtraCash/Rapicash ya forman parte de la deuda de su tarjeta).
 */

/** Serie de fecha de Sheets (días desde 1899-12-30) o texto → Date local. */
export function aFecha(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

export const periodoDe = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '';
const num = v => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))) || 0;
const redondear = n => Math.round(n * 100) / 100;

/** Normaliza filas crudas de Movimientos. */
export function normalizarMovimientos(filas) {
  return filas.map(r => {
    const fecha = aFecha(r.Fecha);
    const per = typeof r.Periodo === 'string' && /^\d{4}-\d{2}$/.test(r.Periodo) ? r.Periodo : periodoDe(fecha);
    return { ...r, Fecha: fecha, Periodo: per, Monto: num(r.Monto), Moneda: String(r.Moneda || 'PEN').toUpperCase() };
  }).filter(r => r.Fecha);
}

export function periodos(movs) {
  return [...new Set(movs.map(m => m.Periodo))].filter(Boolean).sort();
}

/** Periodo por defecto: el último mes cerrado con datos (si el mes actual está en curso). */
export function periodoPorDefecto(movs, hoy = new Date()) {
  const ps = periodos(movs);
  const actual = periodoDe(hoy);
  const cerrados = ps.filter(p => p < actual);
  return cerrados.length ? cerrados[cerrados.length - 1] : ps[ps.length - 1];
}

/** Indicadores de un periodo y moneda. */
export function resumenPeriodo(movs, periodo, moneda = 'PEN') {
  const r = { ingresos: 0, otrosIngresos: 0, cts: 0, gastos: 0, capital: 0, cuotasPrestamo: 0, pagosTarjeta: 0,
    abonoSueldo: 0, adelantos: 0, pagoAdelantos: 0, revisar: 0, movimientos: 0 };
  movs.filter(m => m.Periodo === periodo && m.Moneda === moneda).forEach(m => {
    r.movimientos++;
    if (m.Estado_Clasificacion === 'Revisar') r.revisar++;
    if (m.Tipo === 'Ingreso') { if (m.Subcategoria === 'CTS') r.cts += m.Monto; else r.ingresos += m.Monto; }
    else if (m.Tipo === 'Reembolso') r.otrosIngresos += m.Monto;
    else if (m.Tipo === 'Gasto') r.gastos += m.Monto;
    else if (m.Tipo === 'Amortización deuda') r.capital += m.Monto;
    else if (m.Tipo === 'Abono sueldo') r.abonoSueldo += m.Monto;              // conciliación: no suma al ingreso (lo da la boleta)
    else if (m.Tipo === 'Préstamo recibido' && m.Subcategoria === 'Adelanto de sueldo') r.adelantos += m.Monto;
    else if (m.Tipo === 'Pago deuda') {
      if (m.Subcategoria === 'Cuota de préstamo pagada') r.cuotasPrestamo += m.Monto;
      else if (m.Subcategoria === 'Pago adelanto de sueldo') r.pagoAdelantos += m.Monto;
      else r.pagosTarjeta += m.Monto;
    }
  });
  Object.keys(r).forEach(k => { r[k] = redondear(r[k]); });
  r.flujo = redondear(r.ingresos + r.otrosIngresos - r.gastos - r.capital - r.cuotasPrestamo);
  r.tasaAhorro = r.ingresos ? redondear((r.flujo / r.ingresos) * 100) : null;
  return r;
}

/** Gasto por categoría (desc). */
export function gastosPorCategoria(movs, periodo, moneda = 'PEN') {
  const acc = {};
  movs.filter(m => m.Periodo === periodo && m.Moneda === moneda && m.Tipo === 'Gasto')
    .forEach(m => { acc[m.Categoria || 'Sin clasificar'] = (acc[m.Categoria || 'Sin clasificar'] || 0) + m.Monto; });
  return Object.entries(acc).map(([categoria, monto]) => ({ categoria, monto: redondear(monto) })).sort((a, b) => b.monto - a.monto);
}

/** Ingresos vs gastos por mes (todos los periodos). */
export function evolucionMensual(movs, moneda = 'PEN') {
  return periodos(movs).map(p => {
    const r = resumenPeriodo(movs, p, moneda);
    return { periodo: p, ingresos: redondear(r.ingresos + r.otrosIngresos), gastos: r.gastos };
  });
}

/** Contrapartes con más gasto del periodo. */
export function topContrapartes(movs, periodo, moneda = 'PEN', n = 8) {
  const acc = {};
  movs.filter(m => m.Periodo === periodo && m.Moneda === moneda && m.Tipo === 'Gasto').forEach(m => {
    // En tarjetas la contraparte registrada es el banco: el comercio está en la descripción
    const k = (m.Medio_Pago !== 'Yape' && m.Contraparte === m.Entidad ? m.Descripcion : m.Contraparte) || '(sin contraparte)';
    acc[k] = acc[k] || { contraparte: k, monto: 0, n: 0, categoria: m.Categoria };
    acc[k].monto += m.Monto; acc[k].n++;
  });
  return Object.values(acc).map(x => ({ ...x, monto: redondear(x.monto) })).sort((a, b) => b.monto - a.monto).slice(0, n);
}

/** Medios de pago presentes en el periodo (cobertura de fuentes). */
export function coberturaFuentes(movs, periodo) {
  return [...new Set(movs.filter(m => m.Periodo === periodo).map(m => m.Medio_Pago))].filter(Boolean).sort();
}

/** Última foto de cada tarjeta y préstamos fuera de tarjeta. */
export function resumenDeuda(tarjetas, prestamos) {
  const ultima = {};
  tarjetas.forEach(t => {
    const k = String(t.Tarjeta || t.Producto);
    if (!ultima[k] || String(t.Periodo) > String(ultima[k].Periodo)) ultima[k] = t;
  });
  const tarj = Object.values(ultima).map(t => {
    const linea = num(t.Linea_Credito), deuda = num(t.Deuda_PEN);
    return {
      entidad: t.Entidad, producto: t.Producto, tarjeta: String(t.Tarjeta), periodo: String(t.Periodo),
      linea, deudaPEN: deuda, deudaUSD: num(t.Deuda_USD), disponible: num(t.Disponible),
      pagoMesPEN: num(t.Pago_Mes_PEN), pagoMesUSD: num(t.Pago_Mes_USD), pagoMinPEN: num(t.Pago_Min_PEN),
      ultimoDiaPago: aFecha(t.Ultimo_Dia_Pago), notas: t.Notas || '',
      // Utilización solo si la línea está en la misma moneda que la deuda y es significativa
      utilizacion: linea > 1 && !/USD|US\$/.test(String(t.Notas)) ? Math.min(100, (deuda / linea) * 100) : null
    };
  }).sort((a, b) => b.deudaPEN - a.deudaPEN);

  const numerosTarjeta = new Set(tarj.map(t => t.tarjeta));
  const prest = prestamos.map(p => ({
    id: p.ID_Prestamo, entidad: p.Entidad, producto: p.Producto, numero: String(p.Numero),
    saldo: num(p.Saldo), cuota: num(p.Cuota_Mensual), pagadas: num(p.Cuotas_Pagadas), total: num(p.Cuotas_Total),
    tea: num(p.TEA), proximo: aFecha(p.Proximo_Vencimiento), moneda: p.Moneda || 'PEN', notas: p.Notas || '',
    dentroDeTarjeta: numerosTarjeta.has(String(p.Numero))
  })).sort((a, b) => b.saldo - a.saldo);

  const deudaTarjetasPEN = redondear(tarj.reduce((s, t) => s + t.deudaPEN, 0));
  const deudaTarjetasUSD = redondear(tarj.reduce((s, t) => s + t.deudaUSD, 0));
  const deudaPrestamosPEN = redondear(prest.filter(p => !p.dentroDeTarjeta && p.moneda === 'PEN').reduce((s, p) => s + p.saldo, 0));
  const cuotasMensuales = redondear(prest.reduce((s, p) => s + p.cuota, 0));
  return { tarjetas: tarj, prestamos: prest, deudaTarjetasPEN, deudaTarjetasUSD, deudaPrestamosPEN,
    deudaTotalPEN: redondear(deudaTarjetasPEN + deudaPrestamosPEN), cuotasMensuales };
}

/** Próximos pagos: tarjetas (pago del mes) + cuotas de préstamos pendientes o vencidas. */
export function proximosPagos(deuda, cronograma, hoy = new Date(), dias = 45) {
  const limite = new Date(hoy.getTime() + dias * 86400000);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const out = [];
  deuda.tarjetas.forEach(t => {
    if (t.ultimoDiaPago && (t.pagoMesPEN || t.pagoMesUSD)) {
      out.push({ fecha: t.ultimoDiaPago, concepto: `${t.entidad} ${t.producto} ${t.tarjeta}`, montoPEN: t.pagoMesPEN, montoUSD: t.pagoMesUSD, minimoPEN: t.pagoMinPEN, tipo: 'Tarjeta' });
    }
  });
  const porPrestamo = {};
  cronograma.forEach(c => {
    const est = String(c.Estado);
    if (!/Pendiente|Vencida|Proyectada/.test(est)) return;
    const f = aFecha(c.Fecha_Pago);
    if (!f) return;
    (porPrestamo[c.ID_Prestamo] = porPrestamo[c.ID_Prestamo] || []).push({ ...c, f, est });
  });
  Object.entries(porPrestamo).forEach(([id, cuotas]) => {
    cuotas.sort((a, b) => a.f - b.f);
    const p = deuda.prestamos.find(x => x.id === id);
    if (p && p.dentroDeTarjeta) return; // su cuota ya va dentro del pago del mes de la tarjeta
    const nombre = p ? `${p.entidad} ${p.producto}` : id;
    cuotas.filter(c => /Vencida/.test(c.est)).forEach(c =>
      out.push({ fecha: c.f, concepto: `${nombre} — cuota ${c.Nro_Cuota}`, montoPEN: num(c.Valor_Cuota), tipo: 'Préstamo', vencida: true }));
    // Pendientes cuya fecha ya pasó: el último estado de cuenta no confirma si se pagaron
    cuotas.filter(c => /Pendiente/.test(c.est) && c.f < inicioHoy).forEach(c =>
      out.push({ fecha: c.f, concepto: `${nombre} — cuota ${c.Nro_Cuota}`, montoPEN: num(c.Valor_Cuota), tipo: 'Préstamo', porConfirmar: true }));
    const prox = cuotas.find(c => !/Vencida/.test(c.est) && c.f >= inicioHoy);
    if (prox) out.push({ fecha: prox.f, concepto: `${nombre} — cuota ${prox.Nro_Cuota}`, montoPEN: num(prox.Valor_Cuota), tipo: 'Préstamo' });
  });
  return out
    // Vencidas (según el estado de cuenta) + pagos futuros dentro del horizonte.
    // Un pago de tarjeta con fecha pasada no se muestra: el estado de cuenta no dice si ya se pagó.
    .filter(x => x.vencida || x.porConfirmar || (x.fecha >= inicioHoy && x.fecha <= limite))
    .map(x => ({ ...x, diasRestantes: Math.round((x.fecha - inicioHoy) / 86400000) }))
    .sort((a, b) => a.fecha - b.fecha);
}

/** Rol activo del usuario según la hoja Usuarios. */
export function rolDe(usuarios, email) {
  const u = usuarios.find(x => String(x.Email).trim().toLowerCase() === String(email || '').toLowerCase());
  const activo = u && (u.Activo === true || String(u.Activo).toUpperCase() === 'TRUE');
  return activo ? u.Rol : null;
}

/** Movimientos filtrados para la tabla. */
export function filtrarMovimientos(movs, { periodo, moneda, texto, soloRevisar, categoria }) {
  const t = String(texto || '').trim().toLowerCase();
  return movs.filter(m =>
    (!periodo || m.Periodo === periodo) && (!moneda || m.Moneda === moneda) &&
    (!soloRevisar || m.Estado_Clasificacion === 'Revisar') && (!categoria || m.Categoria === categoria) &&
    (!t || [m.Descripcion, m.Contraparte, m.Categoria, m.Subcategoria, m.Medio_Pago].some(v => String(v || '').toLowerCase().includes(t))))
    .sort((a, b) => b.Fecha - a.Fecha);
}

/** Último saldo de cada cuenta bancaria (hoja Cuentas). */
export function resumenCuentas(cuentas) {
  const ult = {};
  cuentas.forEach(c => {
    const f = aFecha(c.Fecha_Corte);
    const k = String(c.Cuenta);
    if (!ult[k] || f > ult[k].fecha) ult[k] = { entidad: c.Entidad, cuenta: k, producto: c.Producto, moneda: c.Moneda || 'PEN',
      fecha: f, saldoContable: num(c.Saldo_Contable), saldoDisponible: num(c.Saldo_Disponible) };
  });
  return Object.values(ult);
}

/**
 * Boletas: remuneración del mes y descuentos al trabajador (hoja Ingresos).
 *  SPP = aporte obligatorio + prima de seguro + comisión variable; Renta 5ta; Seguros (EPS); otros descuentos.
 *  "Total_Descuentos" de la boleta incluye pagos que se abonan aparte (CTS, utilidades, gratificación),
 *  por eso se usan los componentes: remuneración − descuentos = neto.
 */
export function resumenBoletas(ingresos) {
  return ingresos.map(b => {
    const periodo = typeof b.Periodo === 'string' ? b.Periodo.replace(/^'/, '').slice(0, 7) : periodoDe(aFecha(b.Periodo));
    const remuneracion = num(b.Rem_Basica) + num(b.Asig_Familiar) + num(b.Condicion_Trabajo);
    const spp = num(b.AFP_Aporte) + num(b.AFP_Prima_Seguro) + num(b.AFP_Comision_Variable);
    const renta5 = num(b.Renta_5ta), eps = num(b.Desc_Seguros), otros = num(b.Otros_Descuentos);
    const descuentos = spp + renta5 + eps + otros;
    const basica = num(b.Rem_Basica), asig = num(b.Asig_Familiar), cond = num(b.Condicion_Trabajo);
    const grat = num(b.Gratificacion), bonif = num(b.Bonif_Extraordinaria), cts = num(b.CTS), util = num(b.Utilidades);
    const aparte = grat + bonif + cts + util;
    return {
      periodo, estado: b.Estado || 'Real', remuneracion: redondear(remuneracion),
      basica, asig, cond, grat, bonif, cts, util, extras: redondear(aparte), haberes: redondear(remuneracion + aparte), spp: redondear(spp), renta5: redondear(renta5),
      eps: redondear(eps), otros: redondear(otros), descuentos: redondear(descuentos), neto: num(b.Neto_Recibido),
      aparte: redondear(aparte), essalud: num(b.EsSalud_Empleador),
      cuadra: Math.abs(remuneracion - descuentos - num(b.Neto_Recibido)) < 0.01
    };
  }).filter(b => b.periodo).sort((a, b) => a.periodo.localeCompare(b.periodo));
}

/** Boleta del periodo; si no hay, la más reciente anterior (indicando que es de otro mes). */
export function boletaDelPeriodo(boletas, periodo) {
  const previas = boletas.filter(b => b.periodo <= periodo);
  return previas.length ? previas[previas.length - 1] : null;
}

/** Acumulado del año del periodo (útil para la declaración de renta). */
export function acumuladoAnual(boletas, periodo) {
  const anio = String(periodo).slice(0, 4);
  const acc = { spp: 0, renta5: 0, eps: 0, otros: 0, remuneracion: 0, basica: 0, asig: 0, cond: 0, grat: 0, bonif: 0, cts: 0, util: 0, extras: 0, haberes: 0, meses: 0 };
  boletas.filter(b => b.periodo.startsWith(anio) && b.periodo <= periodo).forEach(b => {
    acc.spp += b.spp; acc.renta5 += b.renta5; acc.eps += b.eps; acc.otros += b.otros; acc.remuneracion += b.remuneracion;
    acc.basica += b.basica; acc.asig += b.asig; acc.cond += b.cond; acc.grat += b.grat; acc.bonif += b.bonif; acc.cts += b.cts; acc.util += b.util; acc.extras += b.extras; acc.haberes += b.haberes; acc.meses++;
  });
  Object.keys(acc).forEach(k => { if (k !== 'meses') acc[k] = redondear(acc[k]); });
  return acc;
}
