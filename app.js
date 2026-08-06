// Tetapan kongsi Supabase — isi sekali sahaja
const DEFAULT_SUPABASE_URL = 'https://gwjyhddctyxzkfdwenwd.supabase.co';                  // ← URL project anda
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3anloZGRjdHl4emtmZHdlbndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5Mjg2MzMsImV4cCI6MjEwMTUwNDYzM30.HdL7db4InLkwQZKd1teEdIDlrUf9seN2NYAd5dplJf4';                 // ← anon key anda

const CFG = {
  url: localStorage.getItem('supa_url') || DEFAULT_SUPABASE_URL,
  key: localStorage.getItem('supa_key') || DEFAULT_SUPABASE_KEY,
};

let supa = null;
try {
  if (typeof supabase !== 'undefined') {
    supa = supabase.createClient(CFG.url, CFG.key);
  }
} catch (e) { console.error('Supabase init gagal:', e); }

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

function formatTarikh(s) {
  if (s == null) return '';
  const parts = String(s).split(/[-/]/).filter(Boolean);
  if (parts.length !== 3) return String(s);
  let [a, b, c] = parts;
  if (a.length === 4) [a, b, c] = [c, b, a];
  const pad = x => String(x).padStart(2, '0');
  return `${pad(a)}/${pad(b)}/${c}`;
}

function formatTarikhPendek(s) {
  if (s == null) return '';
  const parts = String(s).split(/[-/]/).filter(Boolean);
  if (parts.length !== 3) return String(s);
  let [a, b, c] = parts;
  if (a.length === 4) [a, b, c] = [c, b, a]; // a=hari, b=bulan
  const pad = x => String(x).padStart(2, '0');
  return `${pad(a)}/${pad(b)}`;
}

/* ---------- TRANSFORM: Supabase → shape lama (headers + rows) ---------- */
// Kekalkan shape yang sama supaya semua render function sedia ada jalan

function toShapeKelas(records) {
  const headers = ['Tarikh', 'Kelas', 'Tingkatan', 'Guru', 'Jumlah Pelajar', 'Status Kehadiran', 'Masa Kemaskini'];
  const rows = records.map(r => [
    r.tarikh || '',
    r.nama_kelas || '',
    r.tingkatan || '',
    r.nama_guru || '',
    `${r.hadir || 0}/${r.jumlah || 0}`,       // format "30/36"
    r.status_kehadiran || '',
    r.masa_kemaskini || ''
  ]);
  return { headers, rows };
}

function toShapeSummary(records) {
  const headers = ['Tarikh', 'Hadir', 'Jumlah', 'Peratus', 'Kelas Siap', 'Kelas Belum'];
  const rows = records.map(r => [
    r.tarikh, r.hadir, r.jumlah, r.peratus, r.kelas_siap, r.kelas_belum
  ]);
  return { headers, rows };
}

/* ---------- FETCH DATA DARI SUPABASE ---------- */
async function ambilDataKelas(tarikh) {
  if (!supa) throw new Error('Supabase client tidak dijumpai. Pastikan index.html ada load supabase-js.');
  const { data, error } = await supa
    .from('kehadiran_kelas')
    .select('*')
    .eq('tarikh', tarikh)
    .order('nama_kelas', { ascending: true });
  if (error) throw new Error(error.message);
  return toShapeKelas(data || []);
}

async function ambilDataSummary() {
  if (!supa) throw new Error('Supabase client tidak dijumpai.');
  const { data, error } = await supa
    .from('summary')
    .select('*')
    .order('tarikh', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return toShapeSummary(data || []);
}

/* ---------- STATISTIK BULANAN ---------- */
async function ambilDataKelasBulan(tarikh) {
  if (!supa) throw new Error('Supabase client tidak dijumpai.');
  const [d, m, y] = String(tarikh).split('/');
  const { data, error } = await supa
    .from('kehadiran_kelas')
    .select('*')
    .like('tarikh', `%/${m}/${y}`);
  if (error) throw new Error(error.message);
  return data || [];
}

function bulanKeyNorm(s) {
  if (!s) return '';
  const p = String(s).split(/[-/]/).filter(Boolean);
  if (p.length !== 3) return '';
  const y = p[0].length === 4 ? p[0] : p[2];
  return `${y}-${p[1]}`;
}

function aggBulanan(records) {
  const map = {};
  records.forEach(r => {
    const mt = String(r.jumlah_pelajar || '').match(/(\d+)\s*\/\s*(\d+)/);
    const kelas = r.nama_kelas, ting = r.tingkatan;
    if (!kelas || !mt) return;
    if (!map[kelas]) map[kelas] = { k: kelas, t: ting, h: 0, j: 0 };
    map[kelas].h += +mt[1];
    map[kelas].j += +mt[2];
  });
  return Object.values(map)
    .map(x => ({ k: x.k, t: x.t, h: x.h, j: x.j, p: x.j ? x.h / x.j * 100 : 0 }))
    .filter(x => x.j > 0);
}

function renderBulan(records, t) {
  const key = bulanKeyNorm(t);
  const arr = aggBulanan(records.filter(r => bulanKeyNorm(r.tarikh) === key));
  const setCard = (idP, idN, rec) => {
    if (rec) {
      $(idP).textContent = rec.p.toFixed(1) + '%';
      $(idN).textContent = `${rec.k} • Ting ${rec.t}`;
    } else {
      $(idP).textContent = '–';
      $(idN).textContent = 'Tiada data bulan ini';
    }
  };
  if (!arr.length) {
    setCard('kpiTinggiBulan', 'kpiTinggiBulanNama', null);
    setCard('kpiRendahBulan', 'kpiRendahBulanNama', null);
    return;
  }
  const tertinggi = arr.reduce((a, b) => b.p > a.p ? b : a);
  const terendah = arr.reduce((a, b) => b.p < a.p ? b : a);
  setCard('kpiTinggiBulan', 'kpiTinggiBulanNama', tertinggi);
  setCard('kpiRendahBulan', 'kpiRendahBulanNama', terendah);
}

/* ---------- RENDER (SAMA SEPERTI ASAL) ---------- */
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
      labels: rows.map(r => formatTarikhPendek(r[0])),
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
          const t = Math.max(0, Math.min(100, v)) / 100;
          const topL = 62 - t * 22;
          const botL = 46 - t * 20;
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

function idx(headers, regex) { return headers.findIndex(h => regex.test(h)); }

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
  if (!supa || !CFG.url || !CFG.key) { tetapan(); return; }
  const t = tarikhPilihan();
  try {
    const [kelas, sum, rekodBulan] = await Promise.all([
      ambilDataKelas(t),
      ambilDataSummary(),
      ambilDataKelasBulan(t),
    ]);
    renderKPI(kelas); renderTrend(sum); renderTingkat(kelas);
    renderKelas(kelas); renderBelumKemas(kelas); renderBulan(rekodBulan, t);
  } catch (e) {
    $('ralat').textContent = '⚠ ' + e.message;
    $('ralat').style.display = 'block';
  }
}

function tetapan() {
  const a = prompt('Supabase Project URL:', CFG.url);
  if (a) { CFG.url = a.trim(); localStorage.setItem('supa_url', CFG.url); }
  const k = prompt('Supabase Anon Key:', CFG.key);
  if (k) { CFG.key = k.trim(); localStorage.setItem('supa_key', CFG.key); }
  try { supa = supabase.createClient(CFG.url, CFG.key); } catch(e) {}
  muat();
}

/* ---------- INIT ---------- */
$('btnSet').onclick = tetapan;
$('btnRefresh').onclick = muat;
$('tarikh').valueAsDate = new Date();

let _syncT;
$('tarikh').addEventListener('change', () => {
  clearTimeout(_syncT);
  _syncT = setTimeout(muat, 250); // auto-sync bila tukar tarikh
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
muat();