// Public Supabase configuration. Login is fail-closed when configuration is missing.
const SUPABASE_URL = window.SIMA_CONFIG?.SUPABASE_URL || '';
const SUPABASE_KEY = window.SIMA_CONFIG?.SUPABASE_ANON_KEY || window.SIMA_CONFIG?.SUPABASE_PUBLISHABLE_KEY || '';
const SECURE_LOGIN_FUNCTION = 'secure-login';
const sb = SUPABASE_URL && SUPABASE_KEY && window.supabase
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
const $ = s => document.querySelector(s), rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const ROLE_ACCESS = {
  admin: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','inbox','rapat','plafon','cair','periode','akun','audit','profil']),
  pembimbing: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','inbox','rapat','profil']),
  staf_keuangan: new Set(['beranda','proker','undangan','galeri','laporan','struktur','plafon','cair','profil']),
  mahasiswa: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','profil']),
  wakil_rektor: new Set(['beranda','proker','undangan','galeri','laporan','struktur','inbox','rapat','plafon','cair','periode','audit','profil'])
};

const ROLE_LABEL = {
  admin: 'Administrator',
  pembimbing: 'Pembimbing',
  staf_keuangan: 'Staf Keuangan',
  mahasiswa: 'Mahasiswa',
  wakil_rektor: 'Wakil Rektor'
};

function canAccessView(view) {
  if (view === 'ganti_sandi') return true;
  if (view === 'profil') return true;
  const role = S.user?.peran || '';
  return ROLE_ACCESS[role]?.has(view) === true;
}

function roleLabel(role) {
  return ROLE_LABEL[role] || 'Peran tidak dikenal';
}
const ST = { draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Berjalan','ok'], selesai:['Selesai','bl'], tidak_terlaksana:['Tidak terlaksana','er'] };

// State Global
const S = { 
  user:{ nama:'Fadhli Arif', email:'fadhli@stikesmhk.ac.id', nim:'', avatar_url:'', wajib_ganti_sandi: false }, 
  ctx:0, view:'beranda', tab:'semua', q:'', orgId:null,
  history:[], notifications:[], memberships:[], organizations:[], pendingAvatarFile:null,
  ctxs:[], selectedProkerId:null, detail:null,
  undangan:[], inbox:[], gallery:[], reports:[], structure:[], meetings:[], budgets:[], payouts:[], periods:[], audit:[], accounts:[], sources:[],
  renderToken:0,
  ctxs:[],
  proker:[
    { id:1, nama:'Pelatihan Kader Dasar', ketua:'Andi Pratama', jenis:'mandiri', mulai:'2026-10-12', ajuan:8500000, cair:5000000, status:'berjalan' },
    { id:2, nama:'Seminar Kesehatan Mental', ketua:'Siti Rahma', jenis:'kolaboratif', mulai:'2026-10-16', ajuan:12000000, cair:6000000, status:'proposal_diajukan' },
    { id:3, nama:'Bakti Sosial Desa Sehat', ketua:'Dimas Arif', jenis:'mandiri', mulai:'2026-10-25', ajuan:7500000, cair:0, status:'draft' },
    { id:4, nama:'Lomba Inovasi Kesehatan', ketua:'Nadia Putri', jenis:'mandiri', mulai:'2026-11-05', ajuan:10000000, cair:0, status:'revisi' },
    { id:5, nama:'Webinar Karir Kesehatan', ketua:'Rizky Maulana', jenis:'kolaboratif', mulai:'2026-11-12', ajuan:6000000, cair:3000000, status:'disetujui' }
  ],
  csvData: [],
  tempSb: null // Instance Supabase terpisah untuk bulk create
};

const MENU = [
  ['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['struktur','Struktur dan anggota']]],
  ['Review',[['inbox','Inbox review'],['rapat','Rapat']]], 
  ['Anggaran',[['plafon','Plafon dan anggaran'],['cair','Pencairan dan verifikasi']]],
  ['Admin',[['periode','Periode'],['akun','Akun dan penetapan'],['audit','Jejak audit']]]
];

// --- Fungsi Utilitas ---
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2600); }


async function loadOrganizations() {
  if (!sb) return;
  const { data, error } = await sb.from('organisasi').select('id,nama,tipe,periode_id').order('nama');
  if (!error && Array.isArray(data)) S.organizations = data;
}

async function loadMemberships() {
  S.memberships = [];
  if (!sb || !S.user.id) return;
  const { data, error } = await sb.from('keanggotaan')
    .select('id,akun_id,organisasi_id,unit_id,jabatan,status')
    .eq('akun_id', S.user.id)
    .order('status');
  if (!error && Array.isArray(data)) S.memberships = data;
}

async function loadContexts() {
  await Promise.all([loadOrganizations(), loadMemberships()]);
  const privileged = ['admin','wakil_rektor'].includes(S.user.peran);
  if (privileged) {
    const orgContexts = (S.organizations || []).map(o => ({
      orgId:o.id, org:o.nama, peran:roleLabel(S.user.peran), global:false
    }));
    S.ctxs = [{ orgId:null, org:'Semua organisasi', peran:roleLabel(S.user.peran), global:true }, ...orgContexts];
  } else {
    const memberships = S.memberships || [];
    S.ctxs = memberships.map(m => {
      const org = (S.organizations || []).find(o => o.id === m.organisasi_id);
      return {
        orgId:m.organisasi_id,
        org:org?.nama || 'Organisasi',
        peran:m.jabatan || roleLabel(S.user.peran),
        global:false
      };
    });
    if (!S.ctxs.length) {
      S.ctxs = [{ orgId:null, org:'Belum ada organisasi', peran:roleLabel(S.user.peran), global:true }];
    }
  }
  const idx = S.ctxs.findIndex(x => x.orgId === S.orgId);
  S.ctx = idx >= 0 ? idx : 0;
  S.orgId = S.ctxs[S.ctx]?.orgId || null;
}

async function loadProker() {
  if (!sb) return;
  let q = sb.from('proker')
    .select('id,organisasi_id,unit_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,dibuat_oleh,organisasi(id,nama,tipe)')
    .order('tanggal_mulai', { ascending:true });
  if (S.orgId) q = q.eq('organisasi_id', S.orgId);
  const { data, error } = await q;
  if (error) return toast('Gagal memuat proker: ' + error.message);

  const rows = Array.isArray(data) ? data : [];
  const ids = rows.map(x => x.id);
  const totals = Object.fromEntries(ids.map(id => [id, {ajuan:0,cair:0}]));
  if (ids.length) {
    const [budgetRes, payoutRes] = await Promise.all([
      sb.from('item_anggaran').select('proker_id,subtotal').in('proker_id', ids),
      sb.from('pencairan_dana').select('proker_id,jumlah').in('proker_id', ids)
    ]);
    (budgetRes.data || []).forEach(x => { if (totals[x.proker_id]) totals[x.proker_id].ajuan += Number(x.subtotal || 0); });
    (payoutRes.data || []).forEach(x => { if (totals[x.proker_id]) totals[x.proker_id].cair += Number(x.jumlah || 0); });
  }

  S.proker = rows.map(p => ({
    ...p,
    ketua:p.ketua_pelaksana || '-',
    mulai:p.tanggal_mulai || '-',
    ajuan:totals[p.id]?.ajuan || 0,
    cair:totals[p.id]?.cair || 0
  }));
}

async function loadNotifications() {
  S.notifications = [];
  if (!sb || !S.user.id) return;
  const { data, error } = await sb.from('notifikasi')
    .select('id,akun_id,organisasi_id,pesan,tautan,dibaca,dibuat')
    .eq('akun_id', S.user.id)
    .order('dibuat', { ascending:false })
    .limit(50);
  if (!error && Array.isArray(data)) {
    S.notifications = data.map(n => ({
      id:n.id, title:'Notifikasi', message:n.pesan || '',
      type:'info', read:!!n.dibaca, created_at:n.dibuat, view:n.tautan || ''
    }));
  }
}

async function loadProkerDetail() {
  S.detail = null;
  if (!sb || !S.selectedProkerId) return;
  const { data:proker, error } = await sb.from('proker')
    .select('id,organisasi_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,organisasi(id,nama,tipe)')
    .eq('id', S.selectedProkerId).single();
  if (error) return toast('Gagal memuat detail proker: ' + error.message);
  const [docs, kolab, decisions] = await Promise.all([
    sb.from('dokumen').select('id,proker_id,organisasi_id,jenis,status,tahap').eq('proker_id',S.selectedProkerId).order('jenis'),
    sb.from('proker_kolaborator').select('proker_id,organisasi_id,status,porsi_plafon,komentar').eq('proker_id',S.selectedProkerId),
    sb.from('persetujuan').select('id,dokumen_id,versi_id,tahap,keputusan,komentar,oleh,sebagai,waktu').in('dokumen_id',
      (await sb.from('dokumen').select('id').eq('proker_id',S.selectedProkerId)).data?.map(x=>x.id) || []).order('waktu',{ascending:false})
  ]);
  S.detail = { proker, docs:docs.data || [], kolaborator:kolab.data || [], keputusan:decisions.data || [] };
}

async function loadUndangan() {
  S.undangan = [];
  if (!sb) return;
  let q=sb.from('proker_kolaborator').select('proker_id,organisasi_id,status,porsi_plafon,komentar').order('status');
  if(S.orgId) q=q.eq('organisasi_id',S.orgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat undangan: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.proker_id))];
  const orgIds=[...new Set((data||[]).map(x=>x.organisasi_id))];
  const [p,o]=await Promise.all([
    ids.length?sb.from('proker').select('id,nama,tanggal_mulai,organisasi_id').in('id',ids):{data:[]},
    orgIds.length?sb.from('organisasi').select('id,nama,tipe').in('id',orgIds):{data:[]}
  ]);
  const pm=Object.fromEntries((p.data||[]).map(x=>[x.id,x]));
  const om=Object.fromEntries((o.data||[]).map(x=>[x.id,x]));
  S.undangan=(data||[]).map(x=>({...x,proker:pm[x.proker_id],organisasi:om[x.organisasi_id]}));
}

async function loadInbox() {
  S.inbox=[];
  if(!sb)return;
  let q=sb.from('dokumen').select('id,organisasi_id,proker_id,jenis,status,tahap').order('id',{ascending:false});
  if(S.orgId)q=q.eq('organisasi_id',S.orgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat inbox: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.proker_id).filter(Boolean))];
  const pm=ids.length?(await sb.from('proker').select('id,nama,status').in('id',ids)).data||[]:[];
  const pmap=Object.fromEntries(pm.map(x=>[x.id,x]));
  S.inbox=(data||[]).map(x=>({...x,proker:pmap[x.proker_id]}));
}

async function loadGallery() {
  S.gallery=[];
  if(!sb)return;
  let q=sb.from('foto_kegiatan').select('id,proker_id,dokumen_id,drive_file_id,thumb_path,ukuran_byte,urutan,keterangan,diunggah_oleh').order('urutan');
  const {data,error}=await q;
  if(error)return toast('Gagal memuat galeri: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.proker_id).filter(Boolean))];
  const pm=ids.length?(await sb.from('proker').select('id,nama,organisasi_id').in('id',ids)).data||[]:[];
  const pmap=Object.fromEntries(pm.map(x=>[x.id,x]));
  S.gallery=(data||[]).map(x=>({...x,proker:pmap[x.proker_id]}));
}

async function loadReports() {
  S.reports=[];
  if(!sb)return;
  let q=sb.from('dokumen').select('id,organisasi_id,proker_id,jenis,status,tahap').eq('jenis','laporan_akhir').order('id',{ascending:false});
  if(S.orgId)q=q.eq('organisasi_id',S.orgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat laporan: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.proker_id).filter(Boolean))];
  const pm=ids.length?(await sb.from('proker').select('id,nama,status').in('id',ids)).data||[]:[];
  const pmap=Object.fromEntries(pm.map(x=>[x.id,x]));
  S.reports=(data||[]).map(x=>({...x,proker:pmap[x.proker_id]}));
}

async function loadStructure() {
  S.structure=[];
  if(!sb)return;
  let memberships=[];
  if(['admin','wakil_rektor'].includes(S.user.peran)){
    const r=await sb.from('keanggotaan').select('id,akun_id,organisasi_id,unit_id,jabatan,status').order('jabatan');
    memberships=r.data||[];
    if(r.error)return toast('Gagal memuat struktur: '+r.error.message);
  }else{
    let q=sb.from('keanggotaan').select('id,akun_id,organisasi_id,unit_id,jabatan,status');
    if(S.orgId)q=q.eq('organisasi_id',S.orgId);
    const r=await q;
    memberships=r.data||[];
  }
  const userIds=[...new Set(memberships.map(x=>x.akun_id))];
  const orgIds=[...new Set(memberships.map(x=>x.organisasi_id))];
  const unitIds=[...new Set(memberships.map(x=>x.unit_id).filter(Boolean))];
  const [profiles,orgs,units]=await Promise.all([
    userIds.length?sb.from('profiles').select('id,nama,email,nim,peran').in('id',userIds):{data:[]},
    orgIds.length?sb.from('organisasi').select('id,nama,tipe').in('id',orgIds):{data:[]},
    unitIds.length?sb.from('unit_kerja').select('id,organisasi_id,jenis,nama').in('id',unitIds):{data:[]}
  ]);
  const pmap=Object.fromEntries((profiles.data||[]).map(x=>[x.id,x]));
  const omap=Object.fromEntries((orgs.data||[]).map(x=>[x.id,x]));
  const umap=Object.fromEntries((units.data||[]).map(x=>[x.id,x]));
  S.structure=memberships.map(x=>({...x,user:pmap[x.akun_id],organisasi:omap[x.organisasi_id],unit:umap[x.unit_id]}));
}

async function loadMeetings() {
  S.meetings=[];
  if(!sb)return;
  const {data,error}=await sb.from('rapat').select('id,dokumen_id,nomor,tanggal,peserta,notulen,hasil').order('tanggal',{ascending:false});
  if(error)return toast('Gagal memuat rapat: '+error.message);
  S.meetings=data||[];
}

async function loadBudgets() {
  S.budgets=[];
  if(!sb)return;
  let q=sb.from('plafon_anggaran').select('organisasi_id,jumlah,diinput_oleh,diinput_pada').order('diinput_pada',{ascending:false});
  if(S.orgId)q=q.eq('organisasi_id',S.orgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat plafon: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.organisasi_id))];
  const orgs=ids.length?(await sb.from('organisasi').select('id,nama,tipe').in('id',ids)).data||[]:[];
  const omap=Object.fromEntries(orgs.map(x=>[x.id,x]));
  S.budgets=(data||[]).map(x=>({...x,organisasi:omap[x.organisasi_id]}));
}

async function loadPayouts() {
  S.payouts=[];
  if(!sb)return;
  const {data,error}=await sb.from('pencairan_dana').select('id,proker_id,sumber_dana_id,jumlah,tanggal,tahap,dicatat_oleh').order('tanggal',{ascending:false});
  if(error)return toast('Gagal memuat pencairan: '+error.message);
  const pids=[...new Set((data||[]).map(x=>x.proker_id))];
  const sids=[...new Set((data||[]).map(x=>x.sumber_dana_id))];
  const [prokers,sources]=await Promise.all([
    pids.length?sb.from('proker').select('id,nama,organisasi_id').in('id',pids):{data:[]},
    sids.length?sb.from('sumber_dana').select('id,kode,nama').in('id',sids):{data:[]}
  ]);
  const pm=Object.fromEntries((prokers.data||[]).map(x=>[x.id,x]));
  const sm=Object.fromEntries((sources.data||[]).map(x=>[x.id,x]));
  S.payouts=(data||[]).map(x=>({...x,proker:pm[x.proker_id],sumber:sm[x.sumber_dana_id]}));
}

async function loadPeriods() {
  S.periods=[];
  if(!sb)return;
  const {data,error}=await sb.from('periode').select('id,nama,status,batas_lpj').order('batas_lpj');
  if(error)return toast('Gagal memuat periode: '+error.message);
  S.periods=data||[];
}

async function loadAudit() {
  S.audit=[];
  if(!sb)return;
  const {data,error}=await sb.from('jejak_audit').select('id,akun_id,aksi,objek,objek_id,lama,baru,waktu').order('waktu',{ascending:false}).limit(100);
  if(error)return toast('Gagal memuat jejak audit: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.akun_id).filter(Boolean))];
  const profiles=ids.length?(await sb.from('profiles').select('id,nama,email').in('id',ids)).data||[]:[];
  const pm=Object.fromEntries(profiles.map(x=>[x.id,x]));
  S.audit=(data||[]).map(x=>({...x,akun:pm[x.akun_id]}));
}

async function loadAccounts() {
  S.accounts=[];
  if(!sb || S.user.peran!=='admin')return;
  const {data,error}=await sb.from('profiles').select('id,nama,email,nim,peran,aktif,wajib_ganti_sandi').order('nama');
  if(error)return toast('Gagal memuat akun: '+error.message);
  S.accounts=data||[];
}

async function loadSources() {
  S.sources=[];
  if(!sb)return;
  const {data,error}=await sb.from('sumber_dana').select('id,kode,nama,wajib_rincian,perlu_pencairan,hitung_plafon').order('kode');
  if(!error)S.sources=data||[];
}

async function loadViewData(view) {
  switch(view){
    case 'beranda': return Promise.all([loadProker(),loadNotifications(),loadBudgets()]);
    case 'proker': return loadProker();
    case 'review': return loadProkerDetail();
    case 'undangan': return loadUndangan();
    case 'inbox': return loadInbox();
    case 'galeri': return loadGallery();
    case 'laporan': return loadReports();
    case 'struktur': return loadStructure();
    case 'rapat': return loadMeetings();
    case 'plafon': return loadBudgets();
    case 'cair': return Promise.all([loadPayouts(),loadSources()]);
    case 'periode': return loadPeriods();
    case 'audit': return loadAudit();
    case 'akun': return Promise.all([loadAccounts(),loadOrganizations()]);
    case 'profil': return loadMemberships();
    default: return null;
  }
}



const chip = s => { const [t, c] = ST[s] || [s, '']; return `<span class="chip ${c}">${t}</span>`; };

const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ICON = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m15 18-6-6 6-6"/><path d="M9 12h9"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.2 3.3-5 7-5s6.1 1.8 7 5"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m14.5 6.5 3 3"/><path d="M4 20l4.3-.9L19 8.4a2.1 2.1 0 0 0 0-3l-.4-.4a2.1 2.1 0 0 0-3 0L4.9 15.7 4 20Z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m5 12 4 4L19 6"/></svg>'
};
const icon = name => ICON[name] || '';

function avatarMarkup(u, cls='h-10 w-10') {
  const url = u?.avatar_url || '';
  const initials = esc((u?.nama || 'A').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase());
  return url
    ? '<img src="' + esc(url) + '" alt="Foto profil" class="' + cls + ' rounded-full object-cover border border-slate-200">'
    : '<span class="' + cls + ' rounded-full bg-sima-600 text-white font-bold grid place-items-center">' + initials + '</span>';
}

function profileKey() {
  return 'sima:profile:' + String(S.user.email || 'demo').toLowerCase();
}

function loadLocalProfile() {
  if (sb) return;
  try {
    const raw = localStorage.getItem(profileKey());
    if (!raw) return;
    const p = JSON.parse(raw);
    S.user = { ...S.user, ...p };
  } catch (_) {}
}

function saveLocalProfile() {
  if (sb) return;
  try {
    localStorage.setItem(profileKey(), JSON.stringify({
      nama:S.user.nama, nim:S.user.nim || '', avatar_url:S.user.avatar_url || ''
    }));
  } catch (_) {}
}

function navigate(view, push=true) {
  if (!view || view === S.view) return render();
  if (!canAccessView(view)) {
    toast('Akses ditolak untuk role ' + roleLabel(S.user?.peran));
    return;
  }
  if (push) S.history.push(S.view);
  S.view = view;
  render();
}

function goBack() {
  const previous = S.history.pop();
  S.view = previous || 'beranda';
  render();
}

function resetClientState() {
  S.user = { nama:'', email:'', nim:'', avatar_url:'', wajib_ganti_sandi:false };
  S.ctx = 0; S.view = 'beranda'; S.tab = 'semua'; S.q = ''; S.orgId = null;
  S.history = []; S.notifications = []; S.memberships = []; S.pendingAvatarFile = null;
  S.proker = [];
  S.csvData = [];
  S.tempSb = null;
  $('#fl')?.reset();
  $('#v').innerHTML = '';
  $('#nav').innerHTML = '';
  $('#bn').innerHTML = '';
  $('#notifPanel').hidden = true;
  $('#profileMenu').hidden = true;
  $('#notifBadge').textContent = '0';
}


function renderNotificationPanel() {
  const panel = $('#notifPanel'), badge = $('#notifBadge');
  if (!panel || !badge) return;
  const unread = S.notifications.filter(n => !n.read).length;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
  panel.innerHTML = '<div class="p-4 border-b border-slate-100 flex items-center justify-between gap-3">' +
    '<div><p class="font-bold text-sm">Notifikasi</p><p class="text-xs text-slate-500">' +
    (unread ? unread + ' belum dibaca' : 'Semua sudah dibaca') + '</p></div>' +
    '<button data-notif="read-all" class="text-xs font-semibold text-sima-600 hover:underline">Tandai semua</button></div>' +
    (S.notifications.length ? '<div class="max-h-80 overflow-y-auto">' + S.notifications.map(n =>
      '<button data-notif="open" data-id="' + esc(n.id) + '" class="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex gap-3 ' + (n.read ? '' : 'bg-sima-50/50') + '">' +
      '<span class="mt-1 h-2.5 w-2.5 rounded-full shrink-0 ' + (n.read ? 'bg-slate-200' : 'bg-red-500') + '"></span>' +
      '<span class="min-w-0"><span class="block text-sm font-semibold truncate">' + esc(n.title) + '</span>' +
      '<span class="block text-xs text-slate-500 mt-0.5">' + esc(n.message) + '</span></span></button>'
    ).join('') + '</div>' : '<div class="p-8 text-center text-sm text-slate-500">Belum ada notifikasi.</div>');
}

function renderProfileMenu() {
  const m = $('#profileMenu');
  if (!m) return;
  m.innerHTML =
    '<div class="p-4 flex items-center gap-3 border-b border-slate-100">' +
      avatarMarkup(S.user,'h-11 w-11') +
      '<div class="min-w-0"><p class="font-bold text-sm truncate">' + esc(S.user.nama || 'Pengguna') + '</p>' +
      '<p class="text-xs text-slate-500 truncate">' + esc(roleLabel(S.user.peran)) + ' · ' + esc(S.user.email || '') + '</p></div>' +
    '</div>' +
    '<div class="p-2">' +
      '<button data-profile-action="profile" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-sm font-semibold">' + icon('user') + '<span>Profil & organisasi</span></button>' +
      '<button data-profile-action="logout" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 text-red-600 text-sm font-semibold">' + icon('logout') + '<span>Keluar dari akun</span></button>' +
    '</div>';
  m.querySelectorAll('svg').forEach(x => x.classList.add('w-5','h-5','shrink-0'));
}


async function hydrateUser(authUser) {
  let profile = {};
  if (sb) {
    const { data } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
    profile = data || {};
  }
  if (!profile || !profile.aktif) {
    await sb?.auth.signOut();
    resetClientState();
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#le').textContent = 'Akun tidak aktif. Hubungi administrator.';
    return;
  }

  const role = profile.peran || '';
  if (!ROLE_ACCESS[role]) {
    await sb?.auth.signOut();
    resetClientState();
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#le').textContent = 'Akun tidak memiliki role yang valid. Hubungi administrator.';
    return;
  }

  S.user = {
    id: authUser.id,
    nama: profile.nama || authUser.user_metadata?.nama || authUser.email?.split('@')[0] || 'Pengguna',
    email: profile.email || authUser.email || '',
    nim: profile.nim || authUser.user_metadata?.nim || '',
    peran: role,
    avatar_url: profile.avatar_url || authUser.user_metadata?.avatar_url || '',
    wajib_ganti_sandi: !!profile.wajib_ganti_sandi
  };
  if (!sb) loadLocalProfile();
  // Build account-scoped organization context before loading any module data.
  await loadContexts();
  // Drop every account-scoped collection before loading the new identity.
  // This prevents the previous account's data from flashing or remaining in memory.
  S.history = []; S.notifications = []; S.memberships = []; S.pendingAvatarFile = null;
  S.proker = [];
  S.ctx = 0; S.tab = 'semua'; S.q = ''; S.orgId = null;
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (S.user.wajib_ganti_sandi) {
    S.view = 'ganti_sandi';
  } else {
    S.view = 'beranda';
  }
  await loadProker();
  await loadNotifications();
  render();
}

async function logout() {
  if (sb) {
    const { error } = await sb.auth.signOut();
    if (error) return toast('Gagal keluar: ' + error.message);
  }
  resetClientState();
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#le').textContent = '';
  toast('Anda telah keluar dari akun.');
}

async function saveProfile(e) {
  e.preventDefault();
  const nama = $('#profileName').value.trim();
  const nim = $('#profileNim').value.trim();
  if (!nama) return toast('Nama wajib diisi.');
  S.user.nama = nama; S.user.nim = nim;

  if (!sb) {
    if (S.pendingAvatarFile) {
      const reader = new FileReader();
      reader.onload = () => { S.user.avatar_url = reader.result; saveLocalProfile(); render(); toast('Profil berhasil diperbarui.'); };
      reader.readAsDataURL(S.pendingAvatarFile);
    } else {
      saveLocalProfile(); render(); toast('Profil berhasil diperbarui.');
    }
    return;
  }

  const profilePayload = { nama, nim };
  const p = await sb.from('profiles').update(profilePayload).eq('id', S.user.id);
  if (p.error) {
    const meta = await sb.auth.updateUser({ data:{ ...(S.user.id ? {} : {}), nama, nim } });
    if (meta.error) return toast('Nama/NIM gagal disimpan: ' + p.error.message);
  }

  if (S.pendingAvatarFile) {
    const file = S.pendingAvatarFile;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = 'profiles/' + S.user.id + '-' + Date.now() + '.' + ext;
    const up = await sb.storage.from('avatars').upload(path, file, { upsert:true, contentType:file.type || 'image/jpeg' });
    if (!up.error) {
      const pub = sb.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = pub.data?.publicUrl || '';
      S.user.avatar_url = avatarUrl;
      const av = await sb.from('profiles').update({ avatar_url:avatarUrl }).eq('id', S.user.id);
      if (av.error) await sb.auth.updateUser({ data:{ avatar_url:avatarUrl } });
    } else {
      toast('Nama/NIM tersimpan, tetapi foto gagal diunggah. Pastikan bucket Storage "avatars" tersedia.');
    }
  }
  S.pendingAvatarFile = null;
  await loadMemberships();
  render();
  toast('Profil berhasil diperbarui.');
}

function previewAvatar(file) {
  S.pendingAvatarFile = file || null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = $('#profileAvatarPreview');
    if (img) img.innerHTML = '<img src="' + e.target.result + '" alt="Pratinjau foto" class="h-24 w-24 rounded-3xl object-cover border border-slate-200">';
  };
  reader.readAsDataURL(file);
}

async function initAuth() {
  if (!sb) {
    $('#login').hidden = false;
    $('#app').hidden = true;
    $('#le').textContent = 'Login dinonaktifkan sampai SUPABASE_URL dan SUPABASE_ANON_KEY/PUBLISHABLE_KEY dikonfigurasi.';
    renderShell();
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) await hydrateUser(data.session.user);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      resetClientState();
      $('#app').hidden = true;
      $('#login').hidden = false;
    }
  });
}

function getTempSb() {
  if (!S.tempSb) {
    S.tempSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { 
      auth: { persistSession: false, autoRefreshToken: false } 
    });
  }
  return S.tempSb;
}

// --- Fungsi Render ---
function renderShell() {
  if (!$('#app') || !$('#nav') || !$('#bn') || !$('#cx') || !$('#notifBtn') || !$('#backBtn')) return;

  if (S.user.wajib_ganti_sandi) {
    $('#nav').innerHTML = '';
    $('#bn').innerHTML = '';
  } else {
    $('#nav').innerHTML = MENU.map(([g, it]) => {
      const allowed = it.filter(([k]) => canAccessView(k));
      if (!allowed.length) return '';
      return '<div class="mt-5 mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + esc(g) + '</div>' +
        allowed.map(([k, t]) =>
          '<button class="nav flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ' +
          (S.view === k ? 'bg-sima-50 text-sima-600 font-bold' : 'text-slate-600 hover:bg-slate-50') +
          '" data-go="' + esc(k) + '">' + esc(t) + '</button>'
        ).join('');
    }).join('');

    const mobile = [['beranda','Beranda'],['proker','Proker'],['form','+'],['inbox','Review'],['galeri','Galeri']]
      .filter(([k]) => canAccessView(k));
    $('#bn').innerHTML = mobile.map(([k,t]) =>
      '<button class="' +
      (k === 'form'
        ? 'fab bg-sima-600 text-white w-11 h-11 rounded-full text-xl -mt-5 shadow-lg'
        : 'px-2 py-2 text-[11px] ' + (S.view === k ? 'text-sima-600 font-bold' : 'text-slate-500')) +
      '" data-go="' + esc(k) + '" aria-label="' + esc(t) + '">' + esc(t) + '</button>'
    ).join('');
  }

  $('#cx').innerHTML = (S.ctxs || []).map((ctx, i) =>
    '<option value="' + i + '" ' + (i === S.ctx ? 'selected' : '') + '>' +
      esc(ctx.org + ' · ' + ctx.peran) +
    '</option>'
  ).join('');

  $('#notifBtn').innerHTML = icon('bell');
  $('#notifBtn').querySelector('svg')?.classList.add('w-5','h-5');

  const back = $('#backBtn');
  back.innerHTML = icon('back');
  back.className = 'h-10 w-10 shrink-0 rounded-xl bg-white border border-slate-200 shadow-sm grid place-items-center hover:bg-slate-50 transition';
  back.querySelector('svg')?.classList.add('w-5','h-5');
  back.hidden = S.view === 'beranda' || S.view === 'ganti_sandi' || S.history.length === 0;

  const av = $('#av');
  if (av) av.innerHTML = avatarMarkup(S.user);

  renderNotificationPanel();
  renderProfileMenu();
}


const V = {
  beranda: () => `<h1 class="t">Beranda</h1><p class="sub">Ringkasan aktivitas dari semua konteks Anda.</p>
  <div class="card"><h3>Perlu tindakan Anda</h3><div class="g3"><div class="k er"><b>3</b>Menunggu review</div><div class="k wa"><b>2</b>Perlu dilengkapi</div><div class="k bl"><b>1</b>Undangan kolaborasi</div></div></div>
  <div class="row2"><div class="card"><h3>Ringkasan anggaran HIMIKA</h3><div class="bar"><i style="width:42%"></i></div><p class="sub">Plafon Rp75.000.000 · Diajukan Rp48.600.000 · Cair Rp31.200.000 · Sisa Rp43.800.000</p></div>
  <div class="card"><h3>Batas LPJ terdekat</h3><p>Pelatihan Kader Dasar <span class="chip er">2 hari</span></p><p>Seminar Kesehatan Mental <span class="chip wa">5 hari</span></p></div></div>`,
  
  proker() {
    const f = S.proker.filter(p => (S.tab === 'semua' || p.status === S.tab) && p.nama.toLowerCase().includes(S.q.toLowerCase()));
    const tabs = [['semua','Semua'],['draft','Draft'],['proposal_diajukan','Menunggu review'],['revisi','Revisi'],['disetujui','Disetujui'],['berjalan','Berjalan']];
    return `<h1 class="t">Daftar program kerja</h1><p class="sub">Kelola program kerja organisasi Anda.</p>
    <div class="bar2"><input id="q" placeholder="Cari proker atau ketua" value="${S.q}"><button class="btn" data-go="form">+ Buat proker</button></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="card"><table><thead><tr><th>Nama program kerja</th><th>Jenis</th><th>Jadwal</th><th>Diajukan</th><th>Cair</th><th>Status</th></tr></thead><tbody>
    ${f.map(p => `<tr data-id="${p.id}" data-go="review"><td><b>${p.nama}</b><br><small>Ketua: ${p.ketua || '-'}</small></td><td>${p.jenis === 'kolaboratif' ? '<span class="chip pu">Kolaboratif</span>' : '<span class="chip">Mandiri</span>'}</td><td>${p.mulai}</td><td>${rp(p.ajuan)}</td><td>${rp(p.cair)}</td><td>${chip(p.status)}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada proker pada filter ini. Buat proker baru untuk memulai.</td></tr>'}</tbody></table></div>`;
  },
  
  form: () => `<h1 class="t">Form proposal program kerja</h1><p class="sub">Lengkapi data kegiatan, anggaran, dan dokumen proposal.</p>
  <div class="step"><span class="on">Data kegiatan</span><span>Anggaran</span><span>Dokumen</span><span>Pengajuan</span></div>
  <form id="ff" class="card" novalidate><div class="f2"><div><label for="n">Nama program kerja *</label><input id="n" name="nama" placeholder="Contoh: Seminar Kesehatan Mental"></div>
  <div><label for="j">Jenis kegiatan</label><select id="j" name="jenis"><option value="sekali">Sekali</option><option value="berulang">Berulang</option></select></div>
  <div><label for="m">Tanggal mulai *</label><input id="m" name="mulai" type="date"></div><div><label for="e">Tanggal selesai *</label><input id="e" name="selesai" type="date"><small>Batas LPJ otomatis 7 hari setelahnya.</small></div></div>
  <label for="t">Lokasi *</label><input id="t" name="tempat"><label for="d">Deskripsi kegiatan</label><textarea id="d" name="deskripsi" rows="3"></textarea>
  <label>Penyelenggara</label><label><input type="radio" name="pengajuan" value="mandiri" checked style="width:auto"> Diselenggarakan sendiri</label>
  <label><input type="radio" name="pengajuan" value="kolaboratif" style="width:auto"> Kolaboratif dengan organisasi lain</label>
  <div id="kb" hidden><label for="dk">Dana kampus proker (Rp)</label><input id="dk" type="number" min="0" value="0"><div id="ps"></div>
  <button type="button" class="btn w" id="tp">+ Tambah peserta</button><p class="sub" id="tt"></p></div><p class="err" id="fe"></p>
  <div style="margin-top:16px;display:flex;gap:8px"><button class="btn s" type="button" data-go="proker">Batal</button><button class="btn">Simpan draft</button></div></form>`,
  
  review: () => `<h1 class="t">Review dokumen proposal</h1><p class="sub">Seminar Kesehatan Mental · HMJ Keperawatan <span class="chip pu">Kolaboratif</span></p>
  <div class="row2"><div class="pdf"><div>PROPOSAL KEGIATAN<br>SEMINAR KESEHATAN MENTAL</div></div><div><div class="card"><h3>Ringkasan anggaran</h3><p>Total diajukan <b>Rp12.000.000</b></p><p>HMJ Keperawatan (40%): Rp4.800.000<br>UKM Psikomotif (60%): Rp7.200.000</p></div>
  <div class="card"><h3>Komentar</h3><p><b>Andi Pratama</b><br>Mohon dicek kembali rincian transportasi.</p><label for="kk">Tulis komentar *</label><textarea id="kk" rows="3" placeholder="Berikan komentar atau catatan"></textarea><p class="err" id="ke"></p>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn d" data-act="revisi">Minta revisi</button><button class="btn w" data-act="teruskan">Teruskan</button><button class="btn" data-act="setuju">Setujui</button></div></div></div></div>`,

  profil: () => '<div class="max-w-5xl">' +
    '<div class="mb-6"><p class="text-xs font-bold uppercase tracking-wider text-sima-600 mb-2">Akun saya</p><h1 class="t">Profil & organisasi</h1><p class="sub">Kelola identitas akun dan lihat seluruh organisasi serta jabatan Anda.</p></div>' +
    '<div class="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">' +
      '<form id="form-profile" class="card !p-5 lg:!p-6">' +
        '<div class="flex flex-col sm:flex-row sm:items-center gap-4 pb-5 border-b border-slate-100">' +
          '<div id="profileAvatarPreview">' + avatarMarkup(S.user,'h-24 w-24') + '</div>' +
          '<div><h3 class="!mb-1 text-base">Foto profil</h3><p class="sub !mb-3">Gunakan foto yang jelas. JPG/PNG disarankan.</p><label class="btn w-fit cursor-pointer inline-flex items-center gap-2">Ganti foto<input id="profileAvatar" type="file" accept="image/*" class="hidden"></label></div>' +
        '</div>' +
        '<div class="grid gap-4 sm:grid-cols-2 mt-5">' +
          '<div><label for="profileName">Nama lengkap</label><input id="profileName" value="' + esc(S.user.nama) + '" required></div>' +
          '<div><label for="profileNim">NIM</label><input id="profileNim" value="' + esc(S.user.nim || '') + '" placeholder="Masukkan NIM"></div>' +
          '<div class="sm:col-span-2"><label>Email</label><input value="' + esc(S.user.email || '') + '" disabled class="!bg-slate-50 !text-slate-500"></div>' +
        '</div>' +
        '<div class="flex justify-end mt-5"><button class="btn inline-flex items-center gap-2">' + icon('check') + 'Simpan perubahan</button></div>' +
      '</form>' +
      '<div class="card !p-5 lg:!p-6">' +
        '<h3>Organisasi & jabatan</h3><p class="sub">Keanggotaan yang terhubung ke akun ini.</p>' +
        (S.memberships.length ? '<div class="space-y-3">' + S.memberships.map(m =>
          '<div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">' +
            '<div class="flex items-start justify-between gap-3"><div><p class="font-bold">' + esc(m.organisasi) + '</p><p class="text-sm text-slate-500 mt-0.5">' + esc(m.jabatan) + '</p></div>' +
            '<span class="chip ok">' + esc(m.status || 'Aktif') + '</span></div>' +
          '</div>').join('') + '</div>'
          : '<div class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Belum ada data organisasi yang terhubung.</div>') +
      '</div>' +
    '</div>' +
  '</div>',

  akun: () => `<h1 class="t">Manajemen Akun</h1><p class="sub">Buat akun tunggal atau massal untuk calon pengguna SIMA.</p>
  <div class="row2">
    <div class="card">
      <h3>Buat Akun Tunggal</h3>
      <form id="form-akun">
        <label>Nama Lengkap</label><input id="an-nama" required>
        <label>Email</label><input type="email" id="an-email" required>
        <label>NIM</label><input id="an-nim" required>
        <label>Peran</label>
        <select id="an-peran">
          <option value="mahasiswa">Mahasiswa</option>
          <option value="pembimbing">Pembimbing</option>
          <option value="admin">Admin</option>
          <option value="staf_keuangan">Staf Keuangan</option>
        </select>
        <button class="btn full" style="margin-top:16px">Buat Akun</button>
      </form>
    </div>
    <div class="card">
      <h3>Bulk Create via CSV</h3>
      <p class="sub">Format: Nama,Email,NIM,Peran,Organisasi,Jabatan</p>
      <input type="file" id="csv-file" accept=".csv" style="margin-bottom:12px">
      <div id="csv-preview" class="sub" style="max-height:150px; overflow:auto; margin-bottom:12px"></div>
      <button class="btn w" id="btn-csv" disabled>Proses Pembuatan Akun</button>
    </div>
  </div>
  <div class="card">
    <h3>Daftar Akun Terdaftar</h3>
    <div id="list-akun" class="sub">Memuat data...</div>
  </div>`,

  ganti_sandi: () => `<h1 class="t">Ganti Kata Sandi</h1><p class="sub">Anda diwajibkan mengganti kata sandi bawaan untuk melanjutkan.</p>
  <div class="card" style="max-width:400px"><form id="form-ganti-pw">
    <label>Kata Sandi Baru</label><input type="password" id="pw-baru" required minlength="6">
    <button class="btn full" style="margin-top:16px">Simpan Kata Sandi</button>
  </form></div>`
};

function stub(t) { return `<h1 class="t">${t}</h1><p class="sub">Halaman ini mengikuti pola yang sama dan tersambung ke tabel Supabase terkait.</p><div class="card">Belum ada data untuk ditampilkan.</div>`; }

async function render() {
  const token = ++S.renderToken;
  renderShell();
  const root = $('#v');
  if (!root) return;

  root.innerHTML = '<div class="card"><div class="skeleton" style="height:18px;width:35%;margin-bottom:10px"></div><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:180px;margin-top:18px"></div></div>';

  try {
    await loadViewData(S.view);
  } catch (error) {
    console.error(error);
    if (token !== S.renderToken) return;
    root.innerHTML = '<div class="card"><h3>Gagal memuat halaman</h3><p class="sub">' + esc(error?.message || 'Terjadi kesalahan tak terduga.') + '</p></div>';
    return;
  }

  if (token !== S.renderToken) return;
  const viewFn = V[S.view] || (() => stub(S.view));
  root.innerHTML = viewFn();
  if (S.view === 'form') pesertaRow(true);
  renderShell();
}

function pesertaRow(reset) { 
  const box = $('#ps'); if (!box) return; if (reset) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', `<div class="peserta"><input placeholder="Organisasi peserta" aria-label="Organisasi peserta"><input type="number" min="0" placeholder="Porsi Rp" aria-label="Porsi plafon"><button type="button" class="btn d" data-del aria-label="Hapus peserta">×</button></div>`); 
}

function totalPorsi() { return [...document.querySelectorAll('.peserta input[type=number]')].reduce((a, i) => a + (+i.value || 0), 0); }

function hitung() { 
  const dk = +$('#dk')?.value || 0, tp = totalPorsi(); 
  if ($('#tt')) $('#tt').textContent = `Porsi peserta ${rp(tp)} dari ${rp(dk)}. Beban penyelenggara utama ${rp(Math.max(dk - tp, 0))}.`; 
  return tp <= dk; 
}

// --- Fungsi CSV ---
function bacaCSV(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = text.split('\n').filter(r => r.trim() !== '').map(row => {
      return row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g).map(s => s.replace(/^"|"$/g, '').trim());
    });
    S.csvData = rows;
    $('#csv-preview').innerHTML = rows.map((r, i) => `<div>${i+1}. ${r[0]} (${r[1]}) - ${r[3] || 'mahasiswa'}</div>`).join('');
    $('#btn-csv').disabled = rows.length === 0;
  };
  reader.readAsText(file);
}

async function prosesBulkCSV() {
  if (!sb) return toast('Supabase belum dikonfigurasi.');
  if (S.user.peran !== 'admin') return toast('Hanya administrator yang boleh membuat akun.');

  let sukses = 0, gagal = 0;
  const credentials = [];

  for (const row of S.csvData) {
    const [nama, email, nim, peran, orgNama, jabatan] = row;
    if (!email || !nama || !nim) { gagal++; continue; }

    try {
      const { data, error } = await sb.functions.invoke('admin-create-user', {
        body: {
          nama,
          email: email.trim().toLowerCase(),
          nim,
          peran: peran || 'mahasiswa',
          organisasi: orgNama || '',
          jabatan: jabatan || 'Anggota'
        }
      });

      if (error || !data?.ok) {
        console.error(error || data);
        gagal++;
        continue;
      }

      credentials.push({ nama, email, temporary_password:data.temporary_password });
      sukses++;
    } catch (error) {
      console.error(error);
      gagal++;
    }
  }

  toast('Selesai: ' + sukses + ' sukses, ' + gagal + ' gagal. Password sementara unik hanya ditampilkan saat pembuatan.');
  console.table(credentials);
  S.csvData = [];
  render();
}


// --- Event Listeners ---
document.addEventListener('click', async e => {
  if (e.target.closest('#backBtn')) return goBack();

  if (e.target.closest('#notifBtn')) {
    $('#notifPanel').hidden = !$('#notifPanel').hidden;
    $('#profileMenu').hidden = true;
    return;
  }

  if (e.target.closest('#profileBtn')) {
    $('#profileMenu').hidden = !$('#profileMenu').hidden;
    $('#notifPanel').hidden = true;
    return;
  }

  const notif = e.target.closest('[data-notif]');
  if (notif) {
    if (notif.dataset.notif === 'read-all') {
      S.notifications.forEach(n => n.read = true);
      if (sb && S.user.id) {
        try { await sb.from('notifikasi').update({ dibaca:true }).eq('akun_id', S.user.id); } catch (_) {}
      }
      renderNotificationPanel();
      return;
    }
    if (notif.dataset.notif === 'open') {
      const n = S.notifications.find(x => String(x.id) === String(notif.dataset.id));
      if (n) {
        n.read = true;
        if (sb && n.id) {
          try { await sb.from('notifikasi').update({ dibaca:true }).eq('id', n.id).eq('akun_id', S.user.id); } catch (_) {}
        }
        $('#notifPanel').hidden = true;
        if (n.view) navigate(n.view);
        else renderNotificationPanel();
      }
      return;
    }
  }

  const profileAction = e.target.closest('[data-profile-action]');
  if (profileAction) {
    $('#profileMenu').hidden = true;
    if (profileAction.dataset.profileAction === 'profile') return navigate('profil');
    if (profileAction.dataset.profileAction === 'logout') return logout();
  }

  const go = e.target.closest('[data-go]'); 
  if (go) { return navigate(go.dataset.go); }
  
  const tab = e.target.closest('[data-tab]'); 
  if (tab) { S.tab = tab.dataset.tab; return render(); }
  
  if (e.target.id === 'tp') { pesertaRow(); return hitung(); }
  if (e.target.closest('[data-del]')) { e.target.closest('.peserta').remove(); return hitung(); }
  if (e.target.id === 'btn-csv') { prosesBulkCSV(); return; }

  const act = e.target.closest('[data-act]');
  if (act) {
    const k = $('#kk').value.trim();
    if (act.dataset.act === 'revisi' && !k) return $('#ke').textContent = 'Komentar wajib diisi saat meminta revisi.';
    $('#ke').textContent = '';
    if (sb) { 
      const { error } = await sb.from('persetujuan').insert({ dokumen_id:S.dokId, tahap:'koordinator', keputusan:act.dataset.act, komentar:k }); 
      if (error) return toast(error.message); 
    }
    toast({ revisi:'Dokumen dikembalikan untuk revisi', teruskan:'Diteruskan ke tahap berikutnya', setuju:'Dokumen disetujui' }[act.dataset.act]); 
    navigate('inbox');
  }
});

document.addEventListener('input', e => { 
  if (e.target.id === 'q') { S.q = e.target.value; render(); $('#q').focus(); } 
  if (e.target.closest('#kb')) hitung(); 
});

document.addEventListener('change', e => { 
  if (e.target.name === 'pengajuan') $('#kb').hidden = e.target.value !== 'kolaboratif'; 
  if (e.target.id === 'cx') { S.ctx = +e.target.value; render(); } 
  if (e.target.id === 'csv-file') { bacaCSV(e.target.files[0]); }
  if (e.target.id === 'profileAvatar') previewAvatar(e.target.files[0]);
});

document.addEventListener('click', e => {
  if (!e.target.closest('#notifWrap')) $('#notifPanel').hidden = true;
  if (!e.target.closest('#profileWrap')) $('#profileMenu').hidden = true;
});

document.addEventListener('submit', async e => {
  // Form Login
  if (e.target.id === 'fl') {
    e.preventDefault();

    const email = $('#em').value.trim().toLowerCase();
    const password = $('#pw').value;
    const submitBtn = e.target.querySelector('button[type="submit"], .btn.full');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memverifikasi...';
    }

    try {
      if (!sb || !SUPABASE_URL || !SUPABASE_KEY) {
        $('#le').textContent = 'Login dinonaktifkan: konfigurasi Supabase belum dipasang. Mode login sembarang sudah dimatikan.';
        return;
      }

      const response = await fetch(SUPABASE_URL + '/functions/v1/' + SECURE_LOGIN_FUNCTION, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 429) {
        const retry = Number(payload.retry_after || response.headers.get('Retry-After') || 900);
        const minutes = Math.max(1, Math.ceil(retry / 60));
        $('#le').textContent = 'Terlalu banyak percobaan login. Coba lagi dalam ' + minutes + ' menit.';
        return;
      }

      if (!response.ok) {
        $('#le').textContent = payload.error === 'SERVER_NOT_CONFIGURED'
          ? 'Server login belum dikonfigurasi.'
          : payload.error === 'RATE_LIMIT_UNAVAILABLE'
            ? 'Sistem keamanan login sedang tidak tersedia. Coba lagi nanti.'
            : 'Email atau kata sandi salah.';
        return;
      }

      if (!payload.session?.access_token || !payload.session?.refresh_token) {
        $('#le').textContent = 'Sesi login tidak valid.';
        return;
      }

      const { data: sessionData, error: sessionError } = await sb.auth.setSession({
        access_token: payload.session.access_token,
        refresh_token: payload.session.refresh_token
      });

      if (sessionError || !sessionData.session?.user) {
        $('#le').textContent = 'Gagal membuat sesi akun.';
        return;
      }

      $('#le').textContent = '';
      $('#pw').value = '';
      await hydrateUser(sessionData.session.user);
    } catch (error) {
      console.error(error);
      $('#le').textContent = 'Login tidak dapat diproses. Pastikan secure-login Edge Function sudah aktif.';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
      }
    }
    return;
  }

  // Form Proker
  if (e.target.id === 'ff') { 
    e.preventDefault(); 
    const f = Object.fromEntries(new FormData(e.target)), kolab = f.pengajuan === 'kolaboratif', er = [];
    if (!f.nama) er.push('Nama program kerja wajib diisi'); 
    if (!f.mulai || !f.selesai) er.push('Tanggal mulai dan selesai wajib diisi'); 
    if (f.selesai < f.mulai) er.push('Tanggal selesai tidak boleh sebelum tanggal mulai'); 
    if (!f.tempat) er.push('Lokasi wajib diisi');
    if (kolab && !document.querySelector('.peserta input').value) er.push('Tambahkan minimal satu organisasi peserta'); 
    if (kolab && !hitung()) er.push('Total porsi peserta melebihi dana kampus proker');
    
    $('#fe').textContent = er.join('. '); 
    if (er.length) return;
    
    if (sb) { 
      const { error } = await sb.from('proker').insert({ organisasi_id:S.orgId, nama:f.nama, jenis:f.jenis, tanggal_mulai:f.mulai, tanggal_selesai:f.selesai, tempat:f.tempat, deskripsi:f.deskripsi, pengajuan:f.pengajuan }); 
      if (error) return toast(error.message); 
      await loadProker(); 
    } else {
      S.proker.unshift({ id:Date.now(), nama:f.nama, ketua:S.user.nama, jenis:f.pengajuan, mulai:f.mulai, ajuan:0, cair:0, status:'draft' });
    }
    toast('Draft proker tersimpan'); 
    navigate('proker'); 
  }

  // Form Buat Akun Tunggal
  if (e.target.id === 'form-akun') {
    e.preventDefault();
    if (S.user.peran !== 'admin') return toast('Hanya administrator yang boleh membuat akun.');

    const input = {
      nama: $('#an-nama').value.trim(),
      email: $('#an-email').value.trim().toLowerCase(),
      nim: $('#an-nim').value.trim(),
      peran: $('#an-peran').value,
      organisasi: '',
      jabatan: 'Anggota'
    };

    try {
      const { data, error } = await sb.functions.invoke('admin-create-user', { body: input });
      if (error || !data?.ok) return toast(data?.error || error?.message || 'Gagal membuat akun.');
      toast('Akun dibuat. Password sementara: ' + data.temporary_password);
      e.target.reset();
    } catch (error) {
      toast('Gagal membuat akun: ' + error.message);
    }
    return;
  }


  // Form Profil
  if (e.target.id === 'form-profile') {
    return saveProfile(e);
  }

  // Form Ganti Sandi Wajib
  if (e.target.id === 'form-ganti-pw') {
    e.preventDefault();
    const pw = $('#pw-baru').value;
    if (pw.length < 6) return toast('Minimal 6 karakter');
    
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return toast(error.message);
    
    await sb.from('profiles').update({ wajib_ganti_sandi: false }).eq('id', S.user.id);
    S.user.wajib_ganti_sandi = false;
    navigate('beranda', false);
    toast('Kata sandi berhasil diperbarui');
  }
});


initAuth();
