const CFG = {
  api:   localStorage.getItem('api')   || '',
  token: localStorage.getItem('token') || '',
  sheetKelas: 'Kehadiran Kelas',
  sheetSebab: 'Sebab Tidak Hadir Mengikut Pelajar',
};

const charts = {};
const $ = id => document.getElementById(id);

if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

/* ---------- UTILITI ---------- */
function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatTarikh(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getDate())}/${pad2(value.getMonth() + 1)}/${value.getFullYear()}`;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(d.getTime())) return formatTarikh(d);
  }

  const text = String(value || '').trim();
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${pad2(m[3])}/${pad2(m[2])}/${m[1]}`;

  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${pad2(m[1])}/${pad2(m[2])}/${year}`;
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : formatTarikh(d);
}

function hariIniDDMM() {
  return formatTarikh(new Date());
}

function tarikhPilihan() {
  const v = $('tarikh').value;
  return v ? formatTarikh(v) : hariIniDDMM();
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

function idx(headers, regex) {
  return headers.findIndex(h => regex.test(h));
}

/* ---------- RENDER ---------- */
function renderKPI(k) {
  const iJ = idx(k.headers, /jumlah/i);
  const iS = idx(k.headers, /kehadiran/i);
  let hadir = 0, jumlah = 0, belum = 0;

  k.rows.forEach(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      hadir += +m[1];
      jumlah += +m[2];
    }
    if (/BELUM/i.test(r[iS])) belum++;
  });

  $('kpiPeratus').textContent = jumlah ? (hadir / jumlah * 100).toFixed(1) + '%' : '–';
  $('kpiHadir').textContent = `${hadir}/${jumlah}`;
  $('kpiTidak').textContent = jumlah - hadir;
  $('kpiBelum').textContent = belum;
}

function buatChart(id, config) {
  try {
    // Destroy existing chart dengan proper cleanup
    if (charts[id]) {
      charts[id].destroy();
      charts[id] = null;
    }
    
    // Get canvas element
    const canvas = $(id);
    if (!canvas) {
      console.error('[App] Canvas element not found:', id);
      return;
    }
    
    // Reset canvas context jika diperlukan
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Create new chart
    charts[id] = new Chart(canvas, config);
    console.log('[App] Chart created:', id);
  } catch (error) {
    console.error('[App] Error creating chart:', id, error);
  }
}

function nilaiPeratus(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace('%', '').replace(',', '.').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function dataTrend(s) {
  const rows = [s?.rows, s?.data, s?.trend].find(Array.isArray) || [];
  const headers = Array.isArray(s?.headers) ? s.headers : [];
  const iTarikh = Math.max(idx(headers, /tarikh|date/i), 0);
  const iPeratus = idx(headers, /%|peratus|percent|kehadiran/i);

  return rows.map(r => {
    const row = Array.isArray(r) ? r : null;
    const tarikh = row
      ? row[iTarikh] ?? row[0]
      : r?.tarikh ?? r?.date ?? r?.Tarikh ?? r?.Date;
    let peratus = row
      ? (iPeratus >= 0 ? nilaiPeratus(row[iPeratus]) : NaN)
      : nilaiPeratus(r?.peratus ?? r?.percent ?? r?.kehadiran ?? r?.attendance ?? r?.['%']);

    if (!Number.isFinite(peratus) && row) {
      peratus = [3, 2, 1].map(i => nilaiPeratus(row[i])).find(Number.isFinite);
    }

    return Number.isFinite(peratus) && tarikh ? { tarikh, peratus } : null;
  }).filter(Boolean).slice(-30);
}

function renderTrend(s) {
  const rows = dataTrend(s);

  buatChart('chartTrend', {
    type: 'line',
    data: {
      labels: rows.map(r => formatTarikh(String(r.tarikh))),
      datasets: [{
        label: '% Kehadiran',
        data: rows.map(r => r.peratus),
        borderColor: '#0b3d91',
        backgroundColor: 'rgba(11, 61, 145, 0.08)',
        fill: true,
        tension: 0.4,
        borderWidth: 3,
        pointBackgroundColor: '#0b3d91',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            font: { weight: 'bold' },
            callback: v => v + '%'
          }
        }
      },
      plugins: {
        legend: { display: false },
        filler: { propagate: true },
        datalabels: {
          anchor: 'end',
          align: 'top',
          offset: 8,
          formatter: v => typeof v === 'number' ? v.toFixed(1) + '%' : '',
          font: {
            weight: 'bold',
            size: 12
          },
          color: '#0b3d91',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 4,
          padding: 4,
          display: (context) => rows.length > 0 &&
            (context.dataIndex % 5 === 0 || context.dataIndex === context.dataset.data.length - 1)
        }
      }
    }
  });
}

function renderTingkat(k) {
  const iT = idx(k.headers, /tahun|tingkatan/i);
  const iJ = idx(k.headers, /jumlah/i);
  const grp = {};

  k.rows.forEach(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return;
    const g = grp[r[iT]] = grp[r[iT]] || [0, 0];
    g[0] += +m[1];
    g[1] += +m[2];
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

  const colors = ['#0b3d91', '#1e5ba8', '#2d7bc4', '#3d9bde', '#4dabef', '#5dbfff',
                  '#667eea', '#7a8ff5', '#8da0ff', '#a1b1ff'];
  const barGradient = (context) => {
    const chart = context.chart;
    const area = chart.chartArea;
    const color = colors[context.dataIndex % colors.length];
    if (!area) return color;

    const gradient = chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, colors[Math.min(context.dataIndex + 2, colors.length - 1)] || color);
    return gradient;
  };

  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% Kehadiran',
        data: labels.map(l => grp[l][0] / grp[l][1] * 100),
        backgroundColor: barGradient,
        borderRadius: 8,
        borderSkipped: false,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: 'x',
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { font: { weight: 'bold' } }
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'center',
          align: 'center',
          offset: 0,
          formatter: v => typeof v === 'number' ? v.toFixed(1) + '%' : v,
          font: { 
            weight: 'bold', 
            size: 13 
          },
          color: '#fff',
          textStrokeColor: 'rgba(8, 35, 84, 0.45)',
          textStrokeWidth: 2,
          textShadowBlur: 5,
          textShadowColor: 'rgba(8, 35, 84, 0.35)'
        }
      }
    }
  });
}

function renderKelas(k) {
  const iK = idx(k.headers, /^kelas$/i) >= 0 ? idx(k.headers, /^kelas$/i) : idx(k.headers, /kelas/i);
  const iT = idx(k.headers, /tingkatan/i);
  const iJ = idx(k.headers, /jumlah/i);

  const rows = k.rows.map(r => {
    const m = String(r[iJ]).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { k: r[iK], t: r[iT], j: r[iJ], p: +m[1] / +m[2] * 100 } : null;
  }).filter(Boolean).sort((a, b) => a.p - b.p).slice(0, 10);

  if (rows.length === 0) {
    $('tblKelas').innerHTML = '<p class="empty-msg">Tiada rekod atau tiada data tersedia.</p>';
    return;
  }

  $('tblKelas').innerHTML = '<div class="table-wrapper"><table><tr><th>Kelas</th><th>Tingkatan</th><th>Hadir</th><th>%</th></tr>' +
    rows.map(r => `<tr><td>${r.k}</td><td>${r.t}</td><td>${r.j}</td><td><strong>${r.p.toFixed(1)}%</strong></td></tr>`).join('') +
    '</table></div>';
}

function renderSebab(s) {
  if (!s.rows.length) {
    $('tblSebab').innerHTML = '<p class="empty-msg">Tiada rekod atau tiada data tersedia.</p>';
    return;
  }

  const skip = 0;
  const heads = s.headers.filter((_, i) => i !== skip);
  $('tblSebab').innerHTML = '<div class="table-wrapper"><table><tr>' + 
    heads.map(h => `<th>${h}</th>`).join('') + '</tr>' +
    s.rows.slice(0, 100).map(r =>
      '<tr>' + r.filter((_, i) => i !== skip).map(c => `<td>${c}</td>`).join('') + '</tr>'
    ).join('') + '</table></div>';
}

/* ---------- MUAT DATA ---------- */
async function muat() {
  $('ralat').style.display = 'none';
  if (!CFG.api || !CFG.token) return tetapan();

  const t = tarikhPilihan();
  try {
    const [kelas, sum, sebab] = await Promise.all([
      api({ action: 'sheet', name: CFG.sheetKelas, tarikh: t }),
      api({ action: 'summary' }),
      api({ action: 'sheet', name: CFG.sheetSebab, tarikh: t })
        .catch(() => ({ ok: true, headers: [], rows: [] })),
    ]);

    renderKPI(kelas);
    renderTrend(sum);
    renderTingkat(kelas);
    renderKelas(kelas);
    renderSebab(sebab);
  } catch (e) {
    $('ralat').textContent = '⚠ ' + e.message;
    $('ralat').style.display = 'block';
  }
}

function tetapan() {
  const a = prompt('URL Apps Script (/exec):', CFG.api);
  if (a) {
    CFG.api = a.trim();
    localStorage.setItem('api', CFG.api);
  }
  const t = prompt('Token:', CFG.token);
  if (t) {
    CFG.token = t.trim();
    localStorage.setItem('token', CFG.token);
  }
  muat();
}

/* ---------- INIT ---------- */
$('btnSet').onclick = tetapan;
$('btnRefresh').onclick = muat;
$('tarikh').valueAsDate = new Date();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

muat();
