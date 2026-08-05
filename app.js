// Tetapan kongsi (read-only) — isi sekali sahaja, kemudian orang lain terus boleh lihat
const DEFAULT_API = '';    // <-- tampal URL Apps Script (/exec) di sini
const DEFAULT_TOKEN = '';  // <-- tampal token read-only di sini

const CFG = {
  api:   localStorage.getItem('api')   || DEFAULT_API,
  token: localStorage.getItem('token') || DEFAULT_TOKEN,
  sheetKelas: 'Kehadiran Kelas',
};
const charts = {};
const $ = id => document.getElementById(id);
if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

/* ---------- UTILITI ---------- */
function hariIniDDMM() {
  const d = new Date();
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map(x => String(x).padStart(2, '0')).join('/');
}

function tarikhPilihan() {
  const v = $('tarikh').value;
  if (!v) return hariIniDDMM();
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

async function api(params, cuba = 2) {
  const url = `${CFG.api}?token=${encodeURIComponent(CFG.token)}&` +
    new URLSearchParams(params);
  let lastErr;
  for (let i = 0; i < cuba; i++) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      let j;
      try {
        j = JSON.parse(text);
      } catch {
        throw new Error('Respons bukan JSON. Mungkin token tidak sah, skrip Apps Script ralat, atau kuota penuh.');
      }
      if (!j.ok) throw new Error(j.ralat || 'Ralat API');
      return j;
    } catch (e) {
      lastErr = e;
      if (i === cuba - 1) break;
      await new Promise(res => setTimeout(res, 1500));
    }
  }
  throw lastErr;
}

function idx(headers, regex) { return headers.findIndex(h => regex.test(h)); }

function namaTingkatan(label) {
  const map = {
    'SATU': 'Ting 1', 'DUA': 'Ting 2', 'TIGA': 'Ting 3',
    'EMPAT': 'Ting 4', 'LIMA': 'Ting 5',
    'SIX': 'Ting 6', 'SEVEN': 'Ting 7', 'EIGHT': 'Ting 8',
    'NINE': 'Ting 9', 'TEN': 'Ting 10',
    '1': 'Ting 1', '2': 'Ting 2', '3': 'Ting 3',
    '4': 'Ting 4', '5': 'Ting 5',
    '6': 'Ting 6', '7': 'Ting 7', '8': 'Ting 8',
    '9': 'Ting 9', '10': 'Ting 10',
  };
  const m = label.match(/(SATU|DUA|TIGA|EMPAT|LIMA|SIX|SEVEN|EIGHT|NINE|TEN|\d+)/i);
  if (!m) return label;
  return map[m[1].toUpperCase()] || label;
}

/* ---------- RENDER ---------- */
function renderKPI(k) {
  const iJ = idx(k.headers, /jumlah/i), iS = idx(k.headers, /kehadiran/i);
  let hadir = 0, jumlah = 0, belum = 0;
  k.rows.forEach(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/);
    if (m) { hadir += +m[1]; jumlah += +m[2]; }
    if (/BELUM/i.test(r[iS])) belum++;
  });
  $('kpiPeratus').textContent = jumlah ? (hadir / jumlah * 100).toFixed(1) + '%' : '–';
  $('kpiHadir').textContent = `${hadir}/${jumlah}`;
  $('kpiTidak').textContent = jumlah - hadir;
  $('kpiBelum').textContent = belum;
}

function buatChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), config);
}

function formatTarikh(s) {
  if (s == null) return '';
  const parts = String(s).split(/[-/]/).filter(Boolean);
  if (parts.length !== 3) return String(s);
  let [a, b, c] = parts;
  if (a.length === 4) [a, b, c] = [c, b, a]; // tahun dulu -> susun semula
  const pad = x => String(x).padStart(2, '0');
  return `${pad(a)}/${pad(b)}/${c}`;
}

function renderTrend(s) {
  const rows = s.rows.slice(-30);
  buatChart('chartTrend', {
    type: 'line',
    data: {
      labels: rows.map(r => formatTarikh(r[0])),
      datasets: [{ label: '% Kehadiran', data: rows.map(r => r[3]),
        borderColor: '#0b3d91', backgroundColor: '#0b3d9122', fill: true, tension: .3,
        pointRadius: 3, pointBackgroundColor: '#0b3d91' }]
    },
    options: {
      scales: {
        y: { min: 0, max: 100 },
        x: { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 20 } }
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false }
      }
    }
  });
}

function renderTingkat(k) {
  const iT = idx(k.headers, /tahun|tingkatan/i), iJ = idx(k.headers, /jumlah/i);
  const grp = {};
  k.rows.forEach(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/); if (!m) return;
    const g = grp[r[iT]] = grp[r[iT]] || [0, 0];
    g[0] += +m[1]; g[1] += +m[2];
  });
  const urutanTingkatan = {
    'SATU': 1, 'DUA': 2, 'TIGA': 3, 'EMPAT': 4, 'LIMA': 5,
    'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9, 'TEN': 10,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  };
  const labels = Object.keys(grp).sort((a, b) => {
    const ma = a.match(/(\d+|SATU|DUA|TIGA|EMPAT|LIMA|SIX|SEVEN|EIGHT|NINE|TEN)/i);
    const mb = b.match(/(\d+|SATU|DUA|TIGA|EMPAT|LIMA|SIX|SEVEN|EIGHT|NINE|TEN)/i);
    const va = ma ? urutanTingkatan[ma[1].toUpperCase()] : null;
    const vb = mb ? urutanTingkatan[mb[1].toUpperCase()] : null;
    if (va !== null && vb !== null) return va - vb;
    if (va !== null) return -1;
    if (vb !== null) return 1;
    return a.localeCompare(b);
  });
  const displayLabels = labels.map(namaTingkatan);
  const data = labels.map(l => grp[l][0] / grp[l][1] * 100);
  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [{
        label: '% Kehadiran',
        data,
        backgroundColor: (ctx) => {
          const { chart, dataIndex } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return '#2563eb';
          const v = data[dataIndex] || 0;
          const t = Math.max(0, Math.min(100, v)) / 100; // 0..1
          const topL = 62 - t * 22;   // % tinggi -> lebih terang di puncak
          const botL = 46 - t * 20;   // % tinggi -> lebih pekat di bawah
          const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, `hsl(217 91% ${botL}%)`);
          g.addColorStop(1, `hsl(217 91% ${topL}%)`);
          return g;
        },
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 52,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 30 } },
      scales: {
        y: {
          min: 0, max: 100,
          grid: { color: '#eef0f4', drawTicks: false },
          border: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 }, stepSize: 20,
            callback: v => v + '%' }
        },
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#4b5563', font: { size: 12, weight: '600' } }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1d2e', padding: 10, cornerRadius: 8,
          displayColors: false,
          callbacks: { label: c => 'Kehadiran: ' + c.parsed.y.toFixed(1) + '%' }
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          offset: 2,
          formatter: v => typeof v === 'number' ? v.toFixed(1) + '%' : v,
          font: { weight: 'bold', size: 13 },
          color: '#1a1d2e',
          clip: false
        }
      }
    }
  });
}

function renderKelas(k) {
  const iK = idx(k.headers, /^kelas$/i) >= 0 ? idx(k.headers, /^kelas$/i) : idx(k.headers, /kelas/i);
  const iT = idx(k.headers, /tingkatan/i), iJ = idx(k.headers, /jumlah/i);
  const rows = k.rows.map(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { k: r[iK], t: r[iT], j: r[iJ], p: +m[1] / +m[2] * 100 } : null;
  }).filter(Boolean).sort((a, b) => a.p - b.p).slice(0, 10);
  const th = c => `<th class="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">${c}</th>`;
  const td = c => `<td class="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 whitespace-nowrap">${c}</td>`;
  $('tblKelas').innerHTML =
    '<div class="overflow-x-auto rounded-xl border border-slate-100">' +
      '<table class="w-full border-collapse">' +
        '<tr>' + ['Kelas','Tingkatan','Hadir','%'].map(th).join('') + '</tr>' +
        rows.map(r => '<tr class="hover:bg-slate-50 transition-colors">' +
          td(r.k) + td(r.t) + td(r.j) + td(r.p.toFixed(1)) + '</tr>').join('') +
      '</table>' +
    '</div>';
}

function renderBelumKemas(k) {
  const iK = idx(k.headers, /^kelas$/i) >= 0 ? idx(k.headers, /^kelas$/i) : idx(k.headers, /kelas/i);
  const iT = idx(k.headers, /tingkatan/i);
  const iS = idx(k.headers, /kehadiran/i);
  const belum = k.rows.filter(r => /BELUM/i.test(r[iS]))
    .map(r => ({ k: r[iK], t: r[iT] }))
    .sort((a, b) => a.t.localeCompare(b.t) || a.k.localeCompare(b.k));

  if (!belum.length) {
    $('tblBelum').innerHTML = '<p class="text-center py-6 text-emerald-600 font-semibold">✅ Semua kelas telah dikemaskini</p>';
    return;
  }
  const th = c => `<th class="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">${c}</th>`;
  const td = c => `<td class="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 whitespace-nowrap">${c}</td>`;
  $('tblBelum').innerHTML =
    '<div class="overflow-x-auto rounded-xl border border-slate-100">' +
      '<table class="w-full border-collapse">' +
        '<tr>' + ['Kelas','Tingkatan'].map(th).join('') + '</tr>' +
        belum.map(r => '<tr class="hover:bg-slate-50 transition-colors">' + td(r.k) + td(r.t) + '</tr>').join('') +
      '</table>' +
    '</div>';
}

/* ---------- MUAT DATA ---------- */
async function muat() {
  $('ralat').style.display = 'none';
  if (!CFG.api || !CFG.token) return tetapan();
  const t = tarikhPilihan();
  try {
    const [kelas, sum] = await Promise.all([
      api({ action: 'sheet', name: CFG.sheetKelas, tarikh: t }),
      api({ action: 'summary' }),
    ]);
    renderKPI(kelas); renderTrend(sum); renderTingkat(kelas);
    renderKelas(kelas); renderBelumKemas(kelas);
  } catch (e) {
    $('ralat').textContent = '⚠ ' + e.message;
    $('ralat').style.display = 'block';
  }
}

function tetapan() {
  const a = prompt('URL Apps Script (/exec):', CFG.api);
  if (a) { CFG.api = a.trim(); localStorage.setItem('api', CFG.api); }
  const t = prompt('Token:', CFG.token);
  if (t) { CFG.token = t.trim(); localStorage.setItem('token', CFG.token); }
  muat();
}

/* ---------- INIT ---------- */
$('btnSet').onclick = tetapan;
$('btnRefresh').onclick = muat;
$('tarikh').valueAsDate = new Date();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
muat();
