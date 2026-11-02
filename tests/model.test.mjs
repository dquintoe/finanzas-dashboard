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
console.log('\nPRUEBAS DEL MODELO OK');
