const CFG = {
  api:   localStorage.getItem('api')   || '',
  token: localStorage.getItem('token') || '',
  sheetKelas: 'Kehadiran Kelas',
};
const charts = {};
const $ = id => document.getElementById(id);

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
      labels: rows.map(r => r[0]),
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
  const labels = Object.keys(grp).sort();
  buatChart('chartTingkat', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '% Kehadiran',
        data: labels.map(l => (grp[l][0] / grp[l][1] * 100).toFixed(1)),
        backgroundColor: '#2980b9' }]
    },
    options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
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
