<<<<<<< HEAD
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
function hariIniDDMM() {
  const d = new Date();
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map(x => String(x).padStart(2, '0')).join('/');
}

function formatTarikh(iso) {
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  const p = iso.split('/');
  if (p.length === 3) return `${p[0].padStart(2, '0')}/${p[1].padStart(2, '0')}/${p[2]}`;
  return iso;
}
function tarikhPilihan() {
  const v = $('tarikh').value;                 // yyyy-mm-dd
  if (!v) return hariIniDDMM();
  const [y, m, d] = v.split('-');
  return `${d}/${m}/${y}`;
}

async function api(params, cuba = 2) {         // auto-retry kalau network putus
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

function renderTrend(s) {
  const rows = s.rows.slice(-30);
  buatChart('chartTrend', {
    type: 'line',
    data: {
      labels: rows.map(r => formatTarikh(r[0])),
      datasets: [{ label: '% Kehadiran', data: rows.map(r => r[3]),
        borderColor: '#0b3d91', backgroundColor: '#0b3d9122', fill: true, tension: .3 }]
    },
    options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
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
  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '% Kehadiran',
        data: labels.map(l => grp[l][0] / grp[l][1] * 100),
        backgroundColor: '#2980b9' }]
    },
    options: {
      scales: { y: { min: 0, max: 100 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: v => typeof v === 'number' ? v.toFixed(1) + '%' : v,
          font: { weight: 'bold', size: 12 },
          color: '#0b3d91',
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

function renderSebab(s) {
  if (!s.rows.length) { $('tblSebab').innerHTML = '<p>Tiada rekod / tiada data.</p>'; return; }
  const skip = 0; // kolom 0 = Tarikh
  const heads = s.headers.filter((_, i) => i !== skip);
  $('tblSebab').innerHTML = '<table><tr>' + heads.map(h => `<th>${h}</th>`).join('') + '</tr>' +
    s.rows.slice(0, 100).map(r =>
      '<tr>' + r.filter((_, i) => i !== skip).map(c => `<td>${c}</td>`).join('') + '</tr>'
    ).join('') + '</table>';
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
        .catch(() => ({ ok: true, headers: [], rows: [] })), // sebab optional
    ]);
    renderKPI(kelas); renderTrend(sum); renderTingkat(kelas);
    renderKelas(kelas); renderSebab(sebab);
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
=======
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
function hariIniDDMM() {
  const d = new Date();
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map(x => String(x).padStart(2, '0')).join('/');
}

function formatTarikh(iso) {
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  const p = iso.split('/');
  if (p.length === 3) return `${p[0].padStart(2, '0')}/${p[1].padStart(2, '0')}/${p[2]}`;
  return iso;
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

function renderTrend(s) {
  const rows = s.rows.slice(-30);
  buatChart('chartTrend', {
    type: 'line',
    data: {
      labels: rows.map(r => formatTarikh(r[0])),
      datasets: [{
        label: '% Kehadiran',
        data: rows.map(r => r[3]),
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
          ticks: { font: { weight: 'bold' } }
        }
      },
      plugins: {
        legend: { display: false },
        filler: { propagate: true },
        datalabels: {
          anchor: 'top',
          align: 'top',
          offset: 10,
          formatter: v => v.toFixed(1) + '%',
          font: { 
            weight: 'bold', 
            size: 12 
          },
          color: '#0b3d91',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 4,
          padding: 4,
          display: (context) => {
            // Tampilkan label di setiap point (setiap 5 point untuk less clutter)
            return context.dataIndex % 5 === 0 || context.dataIndex === context.dataset.data.length - 1;
          }
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

  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% Kehadiran',
        data: labels.map(l => grp[l][0] / grp[l][1] * 100),
        backgroundColor: colors.slice(0, labels.length),
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
          anchor: 'end',
          align: 'top',
          offset: 8,
          formatter: v => typeof v === 'number' ? v.toFixed(1) + '%' : v,
          font: { 
            weight: 'bold', 
            size: 13 
          },
          color: '#0b3d91',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: 4,
          padding: 6,
          borderWidth: 1,
          borderColor: '#0b3d91'
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

>>>>>>> bf28a0a003bf8f4270fc4c4441228fe74d2dbedd
muat();