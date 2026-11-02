/**
 * Gráficos (Chart.js). Colores tomados de los tokens CSS para respetar modo claro/oscuro.
 * Reglas: un solo eje Y, barras delgadas con extremos redondeados, cuadrícula tenue,
 * leyenda solo con 2+ series, tooltip en cada barra.
 */
import { fmtMoneda, nombreMes } from './views.js';

const instancias = {};
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function base() {
  const Chart = window.Chart;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = css('--tinta-2');
  Chart.defaults.borderColor = css('--rejilla');
  return Chart;
}

/** Plugin: valor al final de cada barra horizontal (etiqueta directa en tinta de texto). */
const etiquetasValor = moneda => ({
  id: 'etiquetasValor',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = css('--tinta');
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    chart.getDatasetMeta(0).data.forEach((bar, i) => {
      ctx.fillText(fmtMoneda(chart.data.datasets[0].data[i], moneda, true), bar.x + 6, bar.y);
    });
    ctx.restore();
  }
});

function crear(id, cfg) {
  if (instancias[id]) instancias[id].destroy();
  instancias[id] = new (base())(document.getElementById(id), cfg);
}

export function graficoEvolucion(serie, moneda, periodoSel) {
  const ejeColor = css('--eje');
  crear('g-evolucion', {
    type: 'bar',
    data: {
      labels: serie.map(s => nombreMes(s.periodo, true)),
      datasets: [
        { label: 'Ingresos', data: serie.map(s => s.ingresos), backgroundColor: css('--serie-1') },
        { label: 'Gastos', data: serie.map(s => s.gastos), backgroundColor: css('--serie-2') }
      ].map(d => ({ ...d, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, categoryPercentage: 0.7, barPercentage: 0.85 }))
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtMoneda(c.parsed.y, moneda)}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { color: ejeColor },
          ticks: { font: ctx => ({ weight: serie[ctx.index]?.periodo === periodoSel ? '700' : '400' }) } },
        y: { beginAtZero: true, border: { display: false }, ticks: { callback: v => fmtMoneda(v, moneda, true) } }
      }
    }
  });
}

export function graficoCategorias(datos, moneda) {
  const top = datos.slice(0, 10);
  const resto = datos.slice(10).reduce((s, d) => s + d.monto, 0);
  if (resto > 0) top.push({ categoria: 'Otras', monto: Math.round(resto * 100) / 100 });
  crear('g-categorias', {
    type: 'bar',
    data: {
      labels: top.map(d => d.categoria),
      datasets: [{ label: 'Gasto', data: top.map(d => d.monto), backgroundColor: css('--serie-1'),
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18 }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      layout: { padding: { right: 72 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtMoneda(c.parsed.x, moneda) } } },
      scales: {
        x: { beginAtZero: true, border: { display: false }, ticks: { callback: v => fmtMoneda(v, moneda, true), maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { color: css('--eje') }, ticks: { color: css('--tinta') } }
      }
    },
    plugins: [etiquetasValor(moneda)]
  });
}

/** Descuentos de boleta por mes: barras apiladas (una sola escala), 3 series en orden fijo de paleta. */
export function graficoDescuentos(boletas) {
  const series = [['SPP (AFP)', 'spp', '--serie-1'], ['Renta 5ta', 'renta5', '--serie-2'], ['Seguros (EPS)', 'eps', '--serie-3']];
  crear('g-descuentos', {
    type: 'bar',
    data: {
      labels: boletas.map(b => nombreMes(b.periodo, true) + (b.estado === 'Estimado' ? '*' : '')),
      datasets: series.map(([label, k, color], i) => ({
        label, data: boletas.map(b => b[k]), backgroundColor: css(color),
        borderColor: css('--superficie'), borderWidth: { top: i < series.length - 1 ? 2 : 0 },
        borderRadius: i === series.length - 1 ? { topLeft: 4, topRight: 4 } : 0, borderSkipped: false, maxBarThickness: 28
      }))
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: {
          label: c => `${c.dataset.label}: ${fmtMoneda(c.parsed.y)}`,
          footer: items => 'Total: ' + fmtMoneda(items.reduce((s, x) => s + x.parsed.y, 0))
        } }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { color: css('--eje') } },
        y: { stacked: true, beginAtZero: true, border: { display: false }, ticks: { callback: v => fmtMoneda(v, 'PEN', true) } }
      }
    }
  });
}

/** Ingresos de la boleta por mes: remuneración fija + conceptos extra, apilados (slots 1–5 de la paleta). */
export function graficoIngresosBoleta(boletas) {
  const series = [['Remuneración fija', 'remuneracion'], ['Gratificación', 'grat'], ['Bonif. extraordinaria', 'bonif'], ['CTS', 'cts'], ['Utilidades', 'util']]
    .filter(([, k]) => boletas.some(b => b[k]));
  crear('g-ingresos-boleta', {
    type: 'bar',
    data: {
      labels: boletas.map(b => nombreMes(b.periodo, true) + (b.estado === 'Estimado' ? '*' : '')),
      datasets: series.map(([label, k], i) => ({
        label, data: boletas.map(b => b[k]), backgroundColor: css(`--serie-${i + 1}`),
        borderColor: css('--superficie'), borderWidth: { top: 2 }, borderSkipped: false, maxBarThickness: 28
      }))
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { filter: i => i.parsed.y > 0, callbacks: {
          label: c => `${c.dataset.label}: ${fmtMoneda(c.parsed.y)}`,
          footer: items => 'Total: ' + fmtMoneda(items.reduce((s, x) => s + x.parsed.y, 0))
        } }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { color: css('--eje') } },
        y: { stacked: true, beginAtZero: true, border: { display: false }, ticks: { callback: v => fmtMoneda(v, 'PEN', true) } }
      }
    }
  });
}
