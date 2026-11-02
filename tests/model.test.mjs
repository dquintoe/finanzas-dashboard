// Pruebas del modelo con datos reales de la BD (node tests/model.test.mjs)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../assets/js/model.js';
const d = JSON.parse(readFileSync(new URL('./fixture.json', import.meta.url)));
const movs = M.normalizarMovimientos(d.mov);
const hoy = new Date(2026, 10, 1);

assert.equal(movs.length, 970);
assert.deepEqual(M.periodos(movs), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
assert.equal(M.periodoPorDefecto(movs, hoy), '2026-10');

const oct = M.resumenPeriodo(movs, '2026-10');
console.log('Octubre PEN:', oct);
assert.equal(oct.gastos, 12336.93);                 // mismo total que la BD original
const ago = M.resumenPeriodo(movs, '2026-08');
assert.equal(ago.ingresos, 7873.72);
const may = M.resumenPeriodo(movs, '2026-05');
assert.equal(may.cts, 5315.92); assert.equal(may.ingresos, 8155.92 + 1059.36);

const cats = M.gastosPorCategoria(movs, '2026-10');
assert.equal(cats[0].categoria, 'Salud');
assert.equal(Math.round(cats.reduce((s, c) => s + c.monto, 0) * 100) / 100, oct.gastos);
console.log('Top categorías oct:', cats.slice(0, 4));

const usd = M.resumenPeriodo(movs, '2026-10', 'USD');
assert.equal(usd.gastos, 6.5);

const deuda = M.resumenDeuda(d.tar, d.pre);
console.log('Deuda:', { tarjetasPEN: deuda.deudaTarjetasPEN, tarjetasUSD: deuda.deudaTarjetasUSD, prestamosPEN: deuda.deudaPrestamosPEN, total: deuda.deudaTotalPEN });
assert.equal(deuda.deudaTarjetasPEN, 77591.03);
assert.equal(deuda.deudaPrestamosPEN, 17522.06 + 4005 + 89770.37);  // sin ExtraCash ni Rapicash (ya están en su tarjeta)
assert.ok(deuda.prestamos.find(p => p.id === 'PR-IBK-EXTRACASH').dentroDeTarjeta);
assert.equal(deuda.tarjetas.find(t => t.tarjeta === '****3717').utilizacion, null); // línea en USD

const pagos = M.proximosPagos(deuda, d.cro, hoy);
console.log('Próximos pagos:'); pagos.forEach(p => console.log(`  ${p.fecha.toISOString().slice(0, 10)} ${p.vencida ? 'VENCIDA ' : p.porConfirmar ? 'POR CONFIRMAR ' : ''}${p.concepto} S/ ${p.montoPEN}`));
assert.ok(pagos.some(p => p.vencida && /Pichincha/.test(p.concepto)));
assert.ok(pagos.every(p => p.vencida || p.porConfirmar || p.fecha >= hoy));
assert.ok(!pagos.some(p => /ExtraCash|Rapicash/.test(p.concepto)), 'cuotas dentro de tarjeta no se duplican');
assert.ok(pagos.some(p => p.porConfirmar && /cuota 70/.test(p.concepto)));

const evo = M.evolucionMensual(movs);
assert.equal(evo.length, 7);
assert.equal(M.rolDe(d.usr, 'DQUINTO.E@gmail.com'), 'Administrador');
assert.equal(M.rolDe(d.usr, 'otro@gmail.com'), null);
assert.equal(M.filtrarMovimientos(movs, { periodo: '2026-10', soloRevisar: true }).every(m => m.Estado_Clasificacion === 'Revisar'), true);
console.log('Cobertura oct:', M.coberturaFuentes(movs, '2026-10').join(', '));
const ingFx = [
  { Periodo: '2026-05', Rem_Basica: 9000, Asig_Familiar: 113, Condicion_Trabajo: 1000, CTS: 5315.92, Utilidades: 1059.36, AFP_Aporte: 911.30, AFP_Prima_Seguro: 124.85, Renta_5ta: 920.93, Desc_Seguros: 0, Neto_Recibido: 8155.92, Estado: 'Real' },
  { Periodo: '2026-07', Rem_Basica: 9000, Asig_Familiar: 113, Condicion_Trabajo: 1000, Gratificacion: 9113, Bonif_Extraordinaria: 615.13, AFP_Aporte: 911.30, AFP_Prima_Seguro: 124.85, Renta_5ta: 920.93, Desc_Seguros: 282.21, Neto_Recibido: 7873.71, Estado: 'Real' },
  { Periodo: '2026-10', Rem_Basica: 9000, Asig_Familiar: 113, Condicion_Trabajo: 1000, AFP_Aporte: 911.30, AFP_Prima_Seguro: 124.85, Renta_5ta: 920.92, Desc_Seguros: 282.21, Neto_Recibido: 7873.72, Estado: 'Estimado' }];
const bol = M.resumenBoletas(ingFx);
assert.ok(bol.every(b => b.cuadra), 'remuneración − descuentos = neto en todas');
assert.equal(bol[0].spp, 1036.15); assert.equal(bol[0].aparte, 6375.28); assert.equal(bol[1].aparte, 9728.13);
assert.equal(bol[0].haberes, 16488.28); assert.equal(bol[1].grat, 9113); assert.equal(bol[2].extras, 0);
assert.equal(M.boletaDelPeriodo(bol, '2026-08').periodo, '2026-07');
const ac = M.acumuladoAnual(bol, '2026-10');
assert.equal(ac.meses, 3); assert.equal(ac.extras, 16103.41); assert.equal(ac.haberes, 46442.41); assert.equal(ac.renta5, 2762.78); assert.equal(ac.eps, 564.42);
console.log('Boletas:', bol.map(b => `${b.periodo} SPP ${b.spp} R5 ${b.renta5} EPS ${b.eps} neto ${b.neto} ${b.cuadra ? 'OK' : 'X'}`).join(' | '));
console.log('\nPRUEBAS DEL MODELO OK');
