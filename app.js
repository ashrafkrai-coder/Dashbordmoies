const CFG = {
  api:   localStorage.getItem('api')   || '',
  token: localStorage.getItem('token') || '',
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
  for (let i = 0; i < cuba; i++) {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (!j.ok) throw new Error(j.ralat || 'Ralat API');
      return j;
    } catch (e) {
      if (i === cuba - 1) throw e;
      await new Promise(res => setTimeout(res, 1500));
    }
  }
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
  const palette = ['#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#22c55e', '#06b6d4', '#a855f7'];
  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [{
        label: '% Kehadiran',
        data,
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return palette[0];
          const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          const base = palette[ctx.dataIndex % palette.length];
          g.addColorStop(0, base + 'cc');
          g.addColorStop(1, base);
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
  $('tblKelas').innerHTML = '<table><tr><th>Kelas</th><th>Tingkatan</th><th>Hadir</th><th>%</th></tr>' +
    rows.map(r => `<tr><td>${r.k}</td><td>${r.t}</td><td>${r.j}</td><td>${r.p.toFixed(1)}</td></tr>`).join('') +
    '</table>';
}

function renderBelumKemas(k) {
  const iK = idx(k.headers, /^kelas$/i) >= 0 ? idx(k.headers, /^kelas$/i) : idx(k.headers, /kelas/i);
  const iT = idx(k.headers, /tingkatan/i);
  const iS = idx(k.headers, /kehadiran/i);
  const belum = k.rows.filter(r => /BELUM/i.test(r[iS]))
    .map(r => ({ k: r[iK], t: r[iT] }))
    .sort((a, b) => a.t.localeCompare(b.t) || a.k.localeCompare(b.k));

  if (!belum.length) {
    $('tblBelum').innerHTML = '<p style="color:#27ae60;font-weight:600">✅ Semua kelas telah dikemaskini</p>';
    return;
  }
  $('tblBelum').innerHTML = '<table><tr><th>Kelas</th><th>Tingkatan</th></tr>' +
    belum.map(r => `<tr><td>${r.k}</td><td>${r.t}</td></tr>`).join('') +
    '</table>';
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
