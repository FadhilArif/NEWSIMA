// Public Supabase configuration. Login is fail-closed when configuration is missing.
const SUPABASE_URL = window.SIMA_CONFIG?.SUPABASE_URL || '';
const SUPABASE_KEY = window.SIMA_CONFIG?.SUPABASE_ANON_KEY || window.SIMA_CONFIG?.SUPABASE_PUBLISHABLE_KEY || '';
const SECURE_LOGIN_FUNCTION = 'secure-login';
const sb = SUPABASE_URL && SUPABASE_KEY && window.supabase
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
const $ = s => document.querySelector(s), rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const ROLE_ACCESS = {
  user: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','profil']),
  admin: new Set(['periode','organisasi','unit_kerja','akun','jabatan','audit','profil']),
  pembimbing: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','inbox','rapat','profil']),
  staf_keuangan: new Set(['beranda','proker','undangan','galeri','laporan','struktur','plafon','cair','profil']),
  mahasiswa: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','profil']),
  wakil_rektor: new Set(['beranda','proker','undangan','galeri','laporan','struktur','inbox','profil'])
}

const ADMIN_VIEWS = new Set(['periode','organisasi','unit_kerja','akun','jabatan','audit']);

const VIEW_PERMISSION = {
  beranda:'beranda.view',
  proker:'proker.view',
  review:'proker.view',
  form:'proker.create',
  undangan:'kolaborasi.view',
  galeri:'proker.view',
  laporan:'proker.view',
  struktur:'struktur.view',
  inbox:'dokumen.review',
  rapat:'rapat.manage',
  plafon:'keuangan.view',
  cair:'keuangan.manage',
  periode:'periode.view',
  organisasi:'organisasi.view',
  unit_kerja:'unit.manage',
  akun:null,
  audit:null,
  jabatan:null,
  koordinator:'koordinator.manage',
  profil:null
};

const PERMISSION_CATALOG = {
  'beranda.view':'Lihat beranda',
  'proker.view':'Lihat program kerja',
  'proker.create':'Buat program kerja',
  'proker.edit':'Edit program kerja',
  'kolaborasi.view':'Lihat kolaborasi',
  'kolaborasi.manage':'Kelola kolaborasi',
  'dokumen.review':'Review dokumen',
  'rapat.manage':'Kelola rapat',
  'laporan.review':'Review laporan',
  'struktur.view':'Lihat struktur',
  'struktur.manage':'Kelola struktur',
  'anggota.manage':'Kelola anggota',
  'keuangan.view':'Lihat keuangan',
  'keuangan.manage':'Kelola keuangan',
  'periode.view':'Lihat periode',
  'organisasi.view':'Lihat organisasi',
  'unit.manage':'Kelola unit kerja',
  'koordinator.view':'Lihat koordinasi UKM',
  'koordinator.manage':'Tunjuk koordinator UKM',
  'club.member.view':'Lihat anggota Club',
  'club.member.manage':'Kelola anggota Club',
  'organisasi.relation.manage':'Kelola koneksi Club'
};

const ROLE_LABEL = {
  user:'User',
  admin:'Administrator',
  pembimbing:'Pembimbing',
  staf_keuangan:'Staf Keuangan',
  mahasiswa:'Mahasiswa',
  wakil_rektor:'Wakil Rektor'
};

const POSITION_LABELS = {
  presiden:'Presiden',
  wakil_presiden:'Wakil Presiden',
  sekretaris:'Sekretaris',
  bendahara:'Bendahara',
  ketua_divisi:'Ketua Divisi',
  staff_divisi:'Staff Divisi',
  menteri:'Menteri',
  staff_kementerian:'Staff Kementerian',
  ketua:'Ketua',
  wakil_ketua:'Wakil Ketua'
};

function positionLabel(code) {
  return POSITION_LABELS[code] || code || 'Anggota';
}

function syncSpecialAccountRole() {
  const roleEl=$('#an-peran'), orgEl=$('#an-org'), jabEl=$('#an-jabatan'), unitEl=$('#an-unit'), unitLabel=$('#an-unit-label');
  if(!roleEl||!orgEl||!jabEl||!unitEl)return;
  const role=roleEl.value;
  const allOrgs=S.organizations||[];
  const bems=allOrgs.filter(o=>o.tipe==='BEM');
  const globalUnits=(S.units||[]).filter(u=>!u.organisasi_id);
  const setOrgOptions=(items,placeholder='Pilih organisasi')=>{
    const current=orgEl.value;
    orgEl.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama)+' · '+esc(o.tipe)+'</option>').join('');
    if(items.some(o=>String(o.id)===String(current)))orgEl.value=current;
  };
  const setUnitOptions=(items,placeholder,disabled=true,required=false)=>{
    unitEl.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nama)+'</option>').join('');
    unitEl.disabled=disabled;
    unitEl.required=required;
  };

  if(role==='staf_keuangan'){
    orgEl.innerHTML='<option value="">Tidak ada organisasi</option>';
    orgEl.value='';
    orgEl.disabled=true;
    jabEl.innerHTML='<option value="">Tidak ada jabatan</option>';
    jabEl.value='';
    jabEl.disabled=true;
    unitLabel.textContent='Unit kerja';
    const tu=globalUnits.find(u=>u.jenis==='tata_usaha');
    setUnitOptions(tu?[tu]:[],'Tata Usaha',true,true);
    if(tu)unitEl.value=tu.id;
    return;
  }

  if(role==='wakil_rektor'){
    setOrgOptions(bems,'BEM wajib');
    orgEl.disabled=true;
    if(bems.length)orgEl.value=bems[0].id;
    jabEl.innerHTML='<option value="">Wakil Rektor</option><option value="wakil_rektor">Wakil Rektor</option>';
    jabEl.value='wakil_rektor';
    jabEl.disabled=true;
    unitLabel.textContent='Unit kerja';
    const rektorat=globalUnits.find(u=>u.jenis==='rektorat');
    setUnitOptions(rektorat?[rektorat]:[],'Rektorat',true,true);
    if(rektorat)unitEl.value=rektorat.id;
    return;
  }

  orgEl.disabled=false;
  jabEl.disabled=false;

  if(role==='pembimbing'){
    const currentOrg=orgEl.value;
    setOrgOptions(allOrgs,'Pilih organisasi yang dibimbing');
    if(allOrgs.some(o=>String(o.id)===String(currentOrg)))orgEl.value=currentOrg;

    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
    jabEl.innerHTML=org
      ? '<option value="reviewer">Reviewer</option>'
      : '<option value="">Pilih organisasi terlebih dahulu</option>';
    jabEl.value=org?'reviewer':'';
    jabEl.disabled=true;

    const units=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'')&&u.jenis==='program_studi');
    unitLabel.textContent='Unit kerja';
    setUnitOptions(units,org?'Pilih unit kerja':'Pilih organisasi terlebih dahulu',true,true);
    if(units.length===1)unitEl.value=units[0].id;
    return;
  }

  // Normal student/user account behavior.
  const positions=(S.positions||[]).filter(j=>Array.isArray(j.berlaku_tipe) && j.berlaku_tipe.includes((S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''))?.tipe));
  jabEl.innerHTML='<option value="">'+(orgEl.value?'Pilih jabatan':'Pilih organisasi dulu')+'</option>'+positions.map(j=>'<option value="'+esc(j.kode)+'">'+esc(j.nama)+'</option>').join('');
  jabEl.value='';
  unitEl.innerHTML='<option value="">Pilih jabatan terlebih dahulu</option>';
  unitEl.disabled=true;
  unitEl.required=false;
  unitLabel.textContent='Unit kerja';
}


function canAccessView(view) {
  const role = S.user?.peran || '';

  if (view === 'ganti_sandi' || view === 'profil') return true;
  if (role === 'admin') return ADMIN_VIEWS.has(view);
  if (ADMIN_VIEWS.has(view)) return false;

  // Wakil Rektor is a campus-wide observer with review authority only for BEM.
  // The actual approve/revise authorization is enforced server-side.
  if (role === 'wakil_rektor') {
    return new Set(['beranda','proker','undangan','galeri','laporan','struktur','inbox','profil']).has(view);
  }

  const permission = VIEW_PERMISSION[view];
  if (permission && S.permissions?.has(permission)) return true;

  if (S.positionsLoaded) return false;
  return ROLE_ACCESS[role]?.has(view) === true;
}

function roleLabel(role) {
  return ROLE_LABEL[role] || 'Peran tidak dikenal';
}

const ST = { direncanakan:['Direncanakan',''], draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Perlu revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Sedang berjalan','ok'], selesai:['Kegiatan selesai','bl'], lpj_diajukan:['LPJ menunggu review','wa'], lpj_disetujui:['LPJ disetujui','ok'], tidak_terlaksana:['Tidak terlaksana','er'], arsip:['Diarsipkan',''], digabung:['Digabung',''] };

// State Global
const S = {
  user:{nama:'',email:'',nim:'',avatar_url:'',wajib_ganti_sandi:false},
  ctx:0,ctxs:[],view:'beranda',tab:'semua',q:'',orgId:null,
  history:[],notifications:[],memberships:[],organizations:[],positions:[],permissions:new Set(),positionsLoaded:false,structureOrgId:null,organizationRelations:[],coordinatorAssignments:[],clubMembers:[],revealedCredential:null,storageStatus:null,pendingAvatarFile:null,
  selectedProkerId:null,detail:null,reviewDocId:null,
  undangan:[],inbox:[],gallery:[],reports:[],structure:[],meetings:[],budgets:[],payouts:[],periods:[],audit:[],accounts:[],sources:[],units:[],
  proker:[],csvData:[],lastCredentials:[],permissionMatrix:{},tempSb:null,renderToken:0,searchTimer:null
}

const MENU = [
  ['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['struktur','Struktur dan anggota'],['koordinator','Koordinator UKM']]],
  ['Review',[['inbox','Inbox review'],['rapat','Rapat']]], 
  ['Anggaran',[['plafon','Plafon dan anggaran'],['cair','Pencairan dan verifikasi']]],
  ['Admin',[['periode','Periode'],['organisasi','Organisasi'],['unit_kerja','Struktur organisasi'],['akun','Akun dan penetapan'],['jabatan','Jabatan & hak akses'],['audit','Jejak audit']]]
];

// --- Fungsi Utilitas ---
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2600); }

async function loadStorageStatus(incomingBytes=0) {
  S.storageStatus=null;
  if(!sb)return null;
  const {data,error}=await sb.rpc('get_storage_usage_status',{p_incoming_bytes:Math.max(0,Number(incomingBytes)||0)});
  if(error){
    console.error('Storage quota check failed:',error);
    return null;
  }
  S.storageStatus=Array.isArray(data)?(data[0]||null):(data||null);
  return S.storageStatus;
}

function formatStorageBytes(bytes) {
  const n=Math.max(0,Number(bytes)||0);
  if(n < 1024*1024) return (n/1024).toFixed(1)+' KB';
  return (n/(1024*1024)).toFixed(1)+' MB';
}

function storageAdminBanner() {
  if(S.user?.peran!=='admin' || !S.storageStatus)return '';
  const s=S.storageStatus;
  const used=Number(s.used_bytes||0);
  const projected=Number(s.projected_bytes||used);
  const warning=!!s.warning;
  const hard=Number(s.hard_limit_bytes||0);
  const percent=Math.min(100,Number(s.percent_used||0));
  const critical=used>=hard;
  if(critical){
    return '<div class="card mb-4 border border-red-200 bg-red-50"><div class="flex items-start justify-between gap-3"><div><h3 class="!text-red-800">Penyimpanan hampir penuh</h3><p class="sub !text-red-700">Upload baru dihentikan. Penggunaan saat ini <b>'+formatStorageBytes(used)+'</b> dari batas aman <b>'+formatStorageBytes(hard)+'</b>.</p></div><span class="chip er">STOP UPLOAD</span></div><div class="mt-3 h-2 rounded-full bg-red-100 overflow-hidden"><div class="h-full bg-red-500" style="width:'+percent+'%"></div></div></div>';
  }
  if(warning){
    return '<div class="card mb-4 border border-amber-200 bg-amber-50"><div class="flex items-start justify-between gap-3"><div><h3 class="!text-amber-900">Peringatan penyimpanan</h3><p class="sub !text-amber-800">Storage SIMA sudah mencapai <b>'+formatStorageBytes(used)+'</b>. Peringatan dimulai pada 900 MB. Batas aman internal '+formatStorageBytes(hard)+'.</p></div><span class="chip wa">'+percent+'%</span></div><div class="mt-3 h-2 rounded-full bg-amber-100 overflow-hidden"><div class="h-full bg-amber-500" style="width:'+percent+'%"></div></div></div>';
  }
  return '';
}


async function loadOrganizations() {
  if (!sb) return;
  const { data, error } = await sb.from('organisasi').select('id,nama,tipe,periode_id,induk_organisasi_id').order('nama');
  if (!error && Array.isArray(data)) S.organizations = data;
}

async function loadMemberships() {
  S.memberships = [];
  S.positions = [];
  S.permissions = new Set();
  S.positionsLoaded = false;
  if (!sb || !S.user.id) return;

  const [mRes,pRes] = await Promise.all([
    sb.from('keanggotaan')
      .select('id,akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status')
      .eq('akun_id', S.user.id)
      .eq('status','aktif'),
    sb.from('jabatan_organisasi')
      .select('id,kode,nama,tingkat,cakupan,unit_wajib,aktif')
      .eq('aktif',true)
      .order('tingkat',{ascending:false})
  ]);

  if (mRes.error) return toast('Gagal memuat penetapan jabatan: '+mRes.error.message);
  if (pRes.error) return toast('Gagal memuat jabatan: '+pRes.error.message);

  S.memberships = Array.isArray(mRes.data) ? mRes.data : [];
  S.positions = Array.isArray(pRes.data) ? pRes.data : [];

  const jabatanIds=[...new Set(S.memberships.map(m=>m.jabatan_id).filter(Boolean))];
  if (jabatanIds.length) {
    const {data,error}=await sb.from('hak_akses_jabatan').select('jabatan_id,kode').in('jabatan_id',jabatanIds);
    if (!error) {
      S.permissions = new Set((data||[]).map(x=>x.kode));
    }
  }
  S.positionsLoaded = true;
}

async function loadPermissionsForOrganization(orgId) {
  if (S.user.peran==='admin') {
    S.permissions = new Set(['*']);
    return;
  }
  if (S.user.peran==='wakil_rektor') {
    S.permissions = new Set([
      'beranda.view','proker.view','kolaborasi.view','struktur.view',
      'dokumen.review','laporan.review','organisasi.view'
    ]);
    return;
  }
  if (!sb || !orgId) {
    S.permissions = new Set();
    return;
  }
  const membership = S.memberships.find(m => m.organisasi_id === orgId && m.status === 'aktif');
  if (!membership?.jabatan_id) {
    S.permissions = new Set();
    return;
  }
  const {data,error}=await sb.from('hak_akses_jabatan').select('kode').eq('jabatan_id',membership.jabatan_id);
  S.permissions = error ? new Set() : new Set((data||[]).map(x=>x.kode));
}

async function loadContexts() {
  await Promise.all([loadOrganizations(), loadMemberships()]);
  if (S.user.peran==='admin') {
    const orgContexts = (S.organizations || []).map(o => ({
      orgId:o.id, org:o.nama, peran:roleLabel(S.user.peran), roleCode:S.user.peran,
      global:false, permissionAll:true
    }));
    S.ctxs = [{ orgId:null, org:'Semua organisasi', peran:roleLabel(S.user.peran), roleCode:S.user.peran, global:true, permissionAll:true }, ...orgContexts];
    S.permissions = new Set(['*']);
  } else if (S.user.peran==='wakil_rektor') {
    S.ctxs = [{
      orgId:null,
      org:'Semua organisasi',
      peran:'Wakil Rektor',
      roleCode:'wakil_rektor',
      global:true,
      permissionAll:false
    }];
    S.permissions = new Set([
      'beranda.view','proker.view','kolaborasi.view','struktur.view',
      'dokumen.review','laporan.review','organisasi.view'
    ]);
  } else {
    const memberships = S.memberships || [];
    S.ctxs = memberships.map(m => {
      const org = (S.organizations || []).find(o => o.id === m.organisasi_id);
      const pos = (S.positions || []).find(j => j.id === m.jabatan_id);
      return {
        orgId:m.organisasi_id,
        org:org?.nama || 'Organisasi',
        peran:pos?.nama || m.jabatan || roleLabel(S.user.peran),
        roleCode:pos?.kode || '',
        jabatanId:m.jabatan_id || null,
        unitId:m.unit_id || null,
        global:false,
        permissionAll:false
      };
    });
    if (!S.ctxs.length) {
      S.ctxs = [{ orgId:null, org:'Belum ada organisasi', peran:roleLabel(S.user.peran), roleCode:'', global:true, permissionAll:false }];
    }
  }
  const idx = S.ctxs.findIndex(x => x.orgId === S.orgId);
  S.ctx = idx >= 0 ? idx : 0;
  S.orgId = S.ctxs[S.ctx]?.orgId || null;

  // Permission set must follow the currently selected organization/position.
  const privileged = ['admin','wakil_rektor'].includes(S.user?.peran||'');
  if (!privileged && S.orgId && Array.isArray(S.memberships)) {
    const selected = S.memberships.find(m => m.organisasi_id === S.orgId);
    if (selected?.jabatan_id) {
      const {data,error}=await sb.from('hak_akses_jabatan').select('kode').eq('jabatan_id',selected.jabatan_id);
      if (!error) S.permissions = new Set((data||[]).map(x=>x.kode));
    } else {
      S.permissions = new Set();
    }
  }
}


async function loadProker() {
  if (!sb) return;

  const isWakil=S.user.peran==='wakil_rektor';
  const ownQuery = (S.orgId && !isWakil)
    ? sb.from('proker')
      .select('id,organisasi_id,unit_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,dibuat_oleh')
      .eq('organisasi_id', S.orgId)
      .order('tanggal_mulai',{ascending:true})
    : (isWakil
      ? sb.from('proker')
        .select('id,organisasi_id,unit_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,dibuat_oleh')
        .order('tanggal_mulai',{ascending:true})
      : Promise.resolve({data:[],error:null}));

  const {data:collabRows,error:collabError}=(!isWakil && S.orgId)
    ? await sb.from('proker_kolaborator').select('proker_id,status').eq('organisasi_id',S.orgId).eq('status','bergabung')
    : {data:[],error:null};

  if(collabError)console.warn('Gagal memuat kolaborasi:',collabError.message);

  const collabIds=[...new Set((collabRows||[]).map(x=>x.proker_id).filter(Boolean))];
  const collabQuery=collabIds.length
    ? sb.from('proker')
      .select('id,organisasi_id,unit_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,dibuat_oleh')
      .in('id',collabIds)
      .order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});

  const [{data:ownRows,error:ownError},{data:collabProkers,error:collabProkerError}] = await Promise.all([ownQuery,collabQuery]);
  if(ownError)return toast('Gagal memuat proker: '+ownError.message);
  if(collabProkerError)console.warn('Gagal memuat proker kolaborasi:',collabProkerError.message);

  const own=(ownRows||[]).map(x=>({...x,__collaborator:false}));
  const collab=(collabProkers||[]).map(x=>({...x,__collaborator:true}));
  const map=new Map();
  [...own,...collab].forEach(x=>map.set(x.id,x));
  const rows=[...map.values()];

  const ids=rows.map(x=>x.id);
  const orgIds=[...new Set(rows.map(x=>x.organisasi_id).filter(Boolean))];
  const totals=Object.fromEntries(ids.map(id=>[id,{ajuan:0,cair:0}]));
  const [orgRes,budgetRes,payoutRes]=await Promise.all([
    orgIds.length?sb.from('organisasi').select('id,nama,tipe').in('id',orgIds):{data:[]},
    ids.length?sb.from('item_anggaran').select('proker_id,subtotal').in('proker_id',ids):{data:[]},
    ids.length?sb.from('pencairan_dana').select('proker_id,jumlah').in('proker_id',ids):{data:[]}
  ]);
  const orgMap=Object.fromEntries((orgRes.data||[]).map(o=>[o.id,o]));
  (budgetRes.data||[]).forEach(x=>{if(totals[x.proker_id])totals[x.proker_id].ajuan+=Number(x.subtotal||0);});
  (payoutRes.data||[]).forEach(x=>{if(totals[x.proker_id])totals[x.proker_id].cair+=Number(x.jumlah||0);});

  S.proker=rows.map(p=>({...p,organisasi:orgMap[p.organisasi_id]||null,ketua:p.ketua_pelaksana||'-',mulai:p.tanggal_mulai||'-',ajuan:totals[p.id]?.ajuan||0,cair:totals[p.id]?.cair||0}));
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
    .select('id,organisasi_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,alasan_tidak_terlaksana,dibuat_oleh')
    .eq('id', S.selectedProkerId).single();
  if (error) return toast('Gagal memuat detail proker: ' + error.message);

  const docIdsResult = await sb.from('dokumen').select('id').eq('proker_id',S.selectedProkerId);
  const docIds = (docIdsResult.data || []).map(x => x.id);

  const [orgRes, docs, kolab, decisions] = await Promise.all([
    proker.organisasi_id
      ? sb.from('organisasi').select('id,nama,tipe').eq('id',proker.organisasi_id).maybeSingle()
      : Promise.resolve({data:null}),
    sb.from('dokumen').select('id,proker_id,organisasi_id,jenis,status,tahap,file_path,file_name,mime_type,file_size,uploaded_by,uploaded_at').eq('proker_id',S.selectedProkerId).order('jenis'),
    sb.from('proker_kolaborator').select('proker_id,organisasi_id,status,porsi_plafon,komentar').eq('proker_id',S.selectedProkerId),
    docIds.length
      ? sb.from('persetujuan').select('id,dokumen_id,versi_id,tahap,keputusan,komentar,oleh,sebagai,waktu').in('dokumen_id',docIds).order('waktu',{ascending:false})
      : Promise.resolve({data:[]})
  ]);

  S.detail = {
    proker:{...proker,organisasi:orgRes.data || null},
    docs:docs.data || [],
    kolaborator:kolab.data || [],
    keputusan:decisions.data || [],
    readOnlyCollaborator: String(proker.organisasi_id)!==String(S.orgId||'') &&
      (kolab.data||[]).some(x=>String(x.organisasi_id)===String(S.orgId||'') && x.status==='bergabung')
  };
  S.reviewDocId = S.detail.docs.find(x=>x.jenis==='proposal')?.id || null;
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
  const targetOrgId=['admin','wakil_rektor'].includes(S.user.peran) ? (S.structureOrgId||S.orgId) : S.orgId;
  if(!targetOrgId)return;
  const {data:memberships,error}=await sb.from('keanggotaan')
    .select('id,akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status')
    .eq('organisasi_id',targetOrgId)
    .order('jabatan');
  if(error)return toast('Gagal memuat struktur: '+error.message);
  const rows=memberships||[];
  const userIds=[...new Set(rows.map(x=>x.akun_id).filter(Boolean))];
  const unitIds=[...new Set(rows.map(x=>x.unit_id).filter(Boolean))];
  const [profiles,units]=await Promise.all([
    userIds.length?sb.from('profiles').select('id,nama,email,nim,peran').in('id',userIds):{data:[]},
    unitIds.length?sb.from('unit_kerja').select('id,organisasi_id,jenis,nama').in('id',unitIds):{data:[]}
  ]);
  const pmap=Object.fromEntries((profiles.data||[]).map(x=>[x.id,x]));
  const umap=Object.fromEntries((units.data||[]).map(x=>[x.id,x]));
  const org=(S.organizations||[]).find(o=>o.id===targetOrgId);
  S.structure=rows.map(x=>({...x,user:pmap[x.akun_id],organisasi:org||null,unit:umap[x.unit_id]}));
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
  const {data,error}=await sb.from('periode').select('id,nama,status,batas_lpj_hari').order('nama');
  if(error)return toast('Gagal memuat periode: '+error.message);
  S.periods=data||[];
}

async function loadUnits() {
  S.units=[];
  if(!sb)return;
  let q=sb.from('unit_kerja').select('id,organisasi_id,jenis,nama').order('nama');
  const targetOrgId=['admin','wakil_rektor'].includes(S.user.peran) ? (S.structureOrgId||S.orgId) : S.orgId;
  if(targetOrgId)q=q.eq('organisasi_id',targetOrgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat unit kerja: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.organisasi_id))];
  const orgs=ids.length?((await sb.from('organisasi').select('id,nama,tipe').in('id',ids)).data||[]):[];
  const om=Object.fromEntries(orgs.map(x=>[x.id,x]));
  S.units=(data||[]).map(x=>({...x,organisasi:om[x.organisasi_id]}));
}

async function loadJabatanAndUnits() {
  if (!sb) return;
  const [{data:positions,error:positionError},{data:units,error:unitError},{data:access,error:accessError}] = await Promise.all([
    sb.from('jabatan_organisasi').select('id,kode,nama,tingkat,cakupan,unit_wajib,unit_jenis_wajib,berlaku_tipe,aktif').eq('aktif',true).order('tingkat',{ascending:false}),
    sb.from('unit_kerja').select('id,organisasi_id,jenis,nama').order('nama'),
    sb.from('hak_akses_jabatan').select('jabatan_id,kode')
  ]);
  if (positionError) return toast('Gagal memuat jabatan: '+positionError.message);
  if (unitError) return toast('Gagal memuat unit kerja: '+unitError.message);
  if (accessError) return toast('Gagal memuat hak akses jabatan: '+accessError.message);
  S.positions = positions || [];
  S.units = units || [];
  S.permissionMatrix = {};
  (access || []).forEach(x=>{
    if(!S.permissionMatrix[x.jabatan_id])S.permissionMatrix[x.jabatan_id]=new Set();
    S.permissionMatrix[x.jabatan_id].add(x.kode);
  });
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

async function loadOrganizationRelations() {
  S.organizationRelations=[];
  if(!sb)return;
  const {data,error}=await sb.from('organisasi_relasi').select('organisasi_id,terhubung_dengan_id,hubungan').order('dibuat_pada',{ascending:false});
  if(error)return toast('Gagal memuat koneksi organisasi: '+error.message);
  const ids=[...new Set((data||[]).flatMap(x=>[x.organisasi_id,x.terhubung_dengan_id]))];
  const orgs=ids.length?(await sb.from('organisasi').select('id,nama,tipe').in('id',ids)).data||[]:[];
  const om=Object.fromEntries(orgs.map(x=>[x.id,x]));
  S.organizationRelations=(data||[]).map(x=>({...x,organisasi:om[x.organisasi_id],terhubung:om[x.terhubung_dengan_id]}));
}

async function loadCoordinatorAssignments() {
  S.coordinatorAssignments=[];
  if(!sb)return;
  let ukmIds=[];
  const current=(S.organizations||[]).find(o=>o.id===S.orgId);
  if(current?.tipe==='UKM') ukmIds=[current.id];
  else if(current?.tipe==='BEM') ukmIds=(S.organizations||[]).filter(o=>o.tipe==='UKM'&&o.induk_organisasi_id===current.id).map(o=>o.id);
  else if(S.orgId) ukmIds=(S.organizations||[]).filter(o=>o.tipe==='UKM'&&o.induk_organisasi_id===S.orgId).map(o=>o.id);
  let q=sb.from('penugasan_koordinator').select('id,organisasi_id,akun_id,status,ditunjuk_oleh,ditunjuk_pada,mulai_pada,berakhir_pada').eq('status','aktif');
  if(ukmIds.length) q=q.in('organisasi_id',ukmIds);
  else if(S.orgId && current?.tipe!=='BEM') q=q.eq('organisasi_id',S.orgId);
  const {data,error}=await q;
  if(error)return toast('Gagal memuat koordinator UKM: '+error.message);
  const ids=[...new Set((data||[]).map(x=>x.akun_id))];
  const profiles=ids.length?(await sb.from('profiles').select('id,nama,nim').in('id',ids)).data||[]:[];
  const pm=Object.fromEntries(profiles.map(x=>[x.id,x]));
  S.coordinatorAssignments=(data||[]).map(x=>({...x,akun:pm[x.akun_id]}));
}

async function loadClubMembers() {
  S.clubMembers=[];
  if(!sb || !S.orgId)return;
  const org=(S.organizations||[]).find(x=>x.id===S.orgId);
  if(org?.tipe!=='CLUB')return;
  const {data,error}=await sb.from('anggota_non_akun').select('id,organisasi_id,nama,nim,aktif,dibuat_pada').eq('organisasi_id',S.orgId).order('nama');
  if(error)return toast('Gagal memuat anggota Club: '+error.message);
  S.clubMembers=data||[];
}

async function loadStructureCatalog() {
  await Promise.all([loadOrganizations(),loadJabatanAndUnits(),loadOrganizationRelations(),loadCoordinatorAssignments(),loadClubMembers()]);
}

async function loadAccounts() {
  S.accounts=[];
  if(!sb || S.user.peran!=='admin')return;
  const {data,error}=await sb.from('profiles').select('id,nama,email,nim,peran,aktif,wajib_ganti_sandi,unit_kerja_id').order('nama');
  if(error)return toast('Gagal memuat akun: '+error.message);

  const ids=(data||[]).map(x=>x.id);
  const [mRes,jRes,oRes,uRes]=await Promise.all([
    ids.length?sb.from('keanggotaan').select('akun_id,organisasi_id,jabatan_id,unit_id,jabatan,status').in('akun_id',ids).eq('status','aktif'):{data:[]},
    sb.from('jabatan_organisasi').select('id,kode,nama'),
    sb.from('organisasi').select('id,nama,tipe'),
    sb.from('unit_kerja').select('id,nama,jenis,organisasi_id')
  ]);
  const jm=Object.fromEntries((jRes.data||[]).map(x=>[x.id,x]));
  const om=Object.fromEntries((oRes.data||[]).map(x=>[x.id,x]));
  const um=Object.fromEntries((uRes.data||[]).map(x=>[x.id,x]));
  const mm={};
  const profileUnits=Object.fromEntries((uRes.data||[]).map(x=>[x.id,x]));
  (mRes.data||[]).forEach(m=>{
    if(!mm[m.akun_id])mm[m.akun_id]=[];
    mm[m.akun_id].push({...m,jabatanInfo:m.jabatan_id?jm[m.jabatan_id]:null,organisasiInfo:m.organisasi_id?om[m.organisasi_id]:null,unitInfo:m.unit_id?um[m.unit_id]:null});
  });
  S.accounts=(data||[]).map(a=>({...a,memberships:mm[a.id]||[],unitInfo:a.unit_kerja_id?profileUnits[a.unit_kerja_id]:null}));
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
    case 'struktur': return Promise.all([loadStructure(),loadUnits(),loadJabatanAndUnits(),loadClubMembers()]);
    case 'rapat': return loadMeetings();
    case 'plafon': return loadBudgets();
    case 'cair': return Promise.all([loadProker(),loadPayouts(),loadSources()]);
    case 'periode': return loadPeriods();
    case 'organisasi': return Promise.all([loadOrganizations(),loadPeriods(),loadOrganizationRelations(),loadCoordinatorAssignments()]);
    case 'unit_kerja': return loadStructureCatalog();
    case 'audit': return loadAudit();
    case 'akun': return Promise.all([loadAccounts(),loadOrganizations(),loadJabatanAndUnits()]);
    case 'jabatan': return loadJabatanAndUnits();
    case 'koordinator': return Promise.all([loadOrganizations(),loadCoordinatorAssignments()]);
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
  const fallback = S.user?.peran === 'admin' ? 'organisasi' : 'beranda';
  S.view = previous && canAccessView(previous) ? previous : fallback;
  render();
}

function resetClientState() {
  S.user={nama:'',email:'',nim:'',avatar_url:'',wajib_ganti_sandi:false};
  S.ctx=0;S.ctxs=[];S.view='beranda';S.tab='semua';S.q='';S.orgId=null;S.permissions=new Set();S.positions=[];S.permissionMatrix={};S.positionsLoaded=false;S.structureOrgId=null;S.organizationRelations=[];S.coordinatorAssignments=[];S.clubMembers=[];S.revealedCredential=null;S.storageStatus=null;
  S.history=[];S.notifications=[];S.memberships=[];S.organizations=[];S.pendingAvatarFile=null;
  S.proker=[];S.detail=null;S.selectedProkerId=null;S.reviewDocId=null;
  S.undangan=[];S.inbox=[];S.gallery=[];S.reports=[];S.structure=[];S.meetings=[];S.budgets=[];S.payouts=[];S.periods=[];S.audit=[];S.accounts=[];S.sources=[];S.units=[];
  S.csvData=[];S.lastCredentials=[];S.tempSb=null;S.renderToken++;
  $('#fl')?.reset();
  $('#v')?.replaceChildren();
  $('#nav')?.replaceChildren();
  $('#bn')?.replaceChildren();
  if($('#notifPanel'))$('#notifPanel').hidden=true;
  if($('#profileMenu'))$('#profileMenu').hidden=true;
  if($('#notifBadge')){ $('#notifBadge').textContent='0'; $('#notifBadge').hidden=true; }
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

  // Clear the previous identity BEFORE building the new account context.
  // loadContexts() populates memberships, organizations, permissions and orgId.
  S.history = [];
  S.notifications = [];
  S.memberships = [];
  S.organizations = [];
  S.positions = [];
  S.permissions = new Set();
  S.positionsLoaded = false;
  S.proker = [];
  S.ctxs = [];
  S.ctx = 0;
  S.tab = 'semua';
  S.q = '';
  S.orgId = null;
  S.pendingAvatarFile = null;
  S.selectedProkerId = null;
  S.structureOrgId = null;
  S.organizationRelations = [];
  S.coordinatorAssignments = [];
  S.clubMembers = [];
  S.revealedCredential = null;

  // Build the new account-scoped organization context after the old identity
  // has been completely cleared.
  await loadContexts();
  if(S.user.peran==='admin') await loadStorageStatus();

  $('#login').hidden = true;
  $('#app').hidden = false;
  if (S.user.wajib_ganti_sandi) {
    S.view = 'ganti_sandi';
  } else if (S.user.peran === 'admin') {
    S.view = 'organisasi';
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
    const path = S.user.id + '/' + Date.now() + '.' + ext;
    const quota=await loadStorageStatus(file.size);
    if(quota && !quota.can_upload){
      S.pendingAvatarFile=null;
      return toast('Penyimpanan SIMA penuh. Upload foto dihentikan agar tidak melewati batas aman.');
    }
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
  await loadStorageStatus();
  render();
  if(S.storageStatus?.warning) toast('Peringatan: storage SIMA sudah mencapai 900 MB atau lebih.');
  else toast('Profil berhasil diperbarui.');
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
    const visibleGroups = S.user.peran === 'admin'
      ? MENU.filter(([g]) => g === 'Admin')
      : MENU.filter(([g]) => g !== 'Admin');

    $('#nav').innerHTML = visibleGroups.map(([g, it]) => {
      const allowed = it.filter(([k]) => canAccessView(k));
      if (!allowed.length) return '';
      return '<div class="mt-5 mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + esc(g) + '</div>' +
        allowed.map(([k, t]) =>
          '<button class="nav flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ' +
          (S.view === k ? 'bg-sima-50 text-sima-600 font-bold' : 'text-slate-600 hover:bg-slate-50') +
          '" data-go="' + esc(k) + '">' + esc(t) + '</button>'
        ).join('');
    }).join('');

    const mobile = S.user.peran === 'admin'
      ? []
      : [['beranda','Beranda'],['proker','Proker'],['form','+'],['inbox','Review'],['galeri','Galeri']]
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



function pageHeader(title, desc, action) {
  return '<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">' +
    '<div><h1 class="t">' + esc(title) + '</h1><p class="sub">' + esc(desc) + '</p></div>' +
    (action || '') + '</div>';
}
function emptyCard(message, action) {
  return '<div class="card text-center py-10"><p class="sub">' + esc(message) + '</p>' + (action || '') + '</div>';
}
function dateID(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
}
const UNIT_TYPE_LABELS = {
  presiden:'Presiden',
  wakil_presiden:'Wakil Presiden',
  sekretaris:'Sekretaris',
  bendahara:'Bendahara',
  ketua:'Ketua',
  wakil_ketua:'Wakil Ketua',
  kementerian:'Kementerian',
  divisi:'Divisi'
};
function unitTypeLabel(type){ return UNIT_TYPE_LABELS[type] || type || '-'; }

function roleChip(role) {
  const labels={admin:'Admin',wakil_rektor:'Wakil Rektor',pembimbing:'Pembimbing',staf_keuangan:'Keuangan',mahasiswa:'Mahasiswa'};
  return '<span class="chip bl">' + esc(labels[role] || role || '-') + '</span>';
}
function orgOptions(selected) {
  return (S.organizations||[]).map(o =>
    '<option value="' + esc(o.id) + '" ' + (String(selected||'')===String(o.id)?'selected':'') + '>' +
    esc(o.nama + ' · ' + o.tipe) + '</option>'
  ).join('');
}


const V = {
  beranda:function(){
    const total=S.proker.length, waiting=S.proker.filter(x=>x.status==='proposal_diajukan').length;
    const running=S.proker.filter(x=>x.status==='berjalan').length;
    const unread=S.notifications.filter(x=>!x.read).length;
    const proposed=S.proker.reduce((a,x)=>a+Number(x.ajuan||0),0);
    const paid=S.proker.reduce((a,x)=>a+Number(x.cair||0),0);
    const upcoming=S.proker.filter(x=>x.tanggal_mulai&&new Date(x.tanggal_mulai)>=new Date()).sort((a,b)=>new Date(a.tanggal_mulai)-new Date(b.tanggal_mulai)).slice(0,5);
    return pageHeader('Beranda','Ringkasan aktivitas akun dan organisasi Anda.')+
      '<div class="g3 mb-4"><div class="k bl"><b>'+total+'</b>Program kerja</div><div class="k er"><b>'+waiting+'</b>Menunggu review</div><div class="k wa"><b>'+unread+'</b>Notifikasi belum dibaca</div></div>'+
      '<div class="row2"><div class="card"><h3>Ringkasan</h3><div class="grid grid-cols-2 gap-3 mt-3"><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Berjalan</div><div class="text-2xl font-bold">'+running+'</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Diajukan</div><div class="text-2xl font-bold">'+rp(proposed)+'</div></div></div><p class="sub mt-3">Total pencairan: <b class="text-slate-900">'+rp(paid)+'</b></p></div>'+
      '<div class="card"><h3>Agenda terdekat</h3>'+(upcoming.length?upcoming.map(x=>'<div class="py-3 border-b border-slate-100 last:border-0"><p class="font-semibold">'+esc(x.nama)+'</p><p class="text-xs text-slate-500">'+dateID(x.tanggal_mulai)+' · '+esc(x.status)+'</p></div>').join(''):'<p class="sub">Belum ada agenda.</p>')+'</div></div>';
  },
  proker:function(){
    const f=S.proker.filter(p=>(S.tab==='semua'||p.status===S.tab)&&((p.nama||'').toLowerCase().includes(S.q.toLowerCase())||(p.ketua||'').toLowerCase().includes(S.q.toLowerCase())));
    const tabs=[['semua','Semua'],['direncanakan','Direncanakan'],['revisi','Perlu revisi'],['proposal_diajukan','Menunggu review'],['disetujui','Disetujui'],['berjalan','Berjalan'],['selesai','Selesai'],['lpj_diajukan','LPJ review'],['lpj_disetujui','LPJ disetujui']];
    const actionLabel=(p)=>{
      if(S.user.peran==='wakil_rektor'){
        if(p.organisasi?.tipe==='BEM' && ['proposal_diajukan','lpj_diajukan'].includes(p.status)) return 'Review pengajuan';
        return 'Lihat proker';
      }
      if(p.__collaborator)return 'Lihat proker';
      if(p.status==='direncanakan')return 'Ajukan proposal';
      if(p.status==='revisi')return 'Ajukan ulang';
      if(p.status==='disetujui')return 'Mulai pelaksanaan';
      if(p.status==='berjalan')return 'Tandai selesai';
      if(p.status==='selesai')return 'Ajukan LPJ';
      if(p.status==='proposal_diajukan')return 'Lihat review';
      if(p.status==='lpj_diajukan')return 'Review LPJ';
      return 'Lihat detail';
    };
    return pageHeader('Daftar program kerja','Kelola program kerja Anda.',canAccessView('form')?'<button class="btn" data-go="form">+ Buat proker</button>':'')+
      '<div class="bar2"><input id="q" placeholder="Cari proker atau ketua" value="'+esc(S.q)+'"></div>'+
      '<div class="tabs">'+tabs.map(x=>'<button class="'+(S.tab===x[0]?'on':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'+
      (f.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Program</th><th>Organisasi</th><th>Jadwal</th><th>Diajukan</th><th>Cair</th><th>Status</th><th>Tindak lanjut</th></tr></thead><tbody>'+
        f.map(p=>'<tr><td><b>'+esc(p.nama)+'</b><br><small>Ketua: '+esc(p.ketua||'-')+'</small></td><td>'+esc(p.organisasi?.nama||'-')+(p.__collaborator?'<br><span class="chip bl">Kolaborasi · lihat saja</span>':'')+'</td><td>'+dateID(p.tanggal_mulai)+'</td><td>'+rp(p.ajuan)+'</td><td>'+rp(p.cair)+'</td><td>'+chip(p.status)+'</td><td><button class="btn s" data-go="review" data-proker-id="'+esc(p.id)+'">'+esc(actionLabel(p))+'</button></td></tr>').join('')+
        '</tbody></table></div>':emptyCard('Belum ada proker yang sesuai.'));
  },
  form:function(){
    const privileged=['admin','wakil_rektor'].includes(S.user.peran);
    const currentOrg=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
    return pageHeader('Form proposal program kerja','Lengkapi data kegiatan sebelum menjadi draft.')+
      '<form id="ff" class="card" novalidate>'+
      (privileged
        ? '<label for="f-org">Organisasi *</label><select id="f-org" name="organisasi_id" required><option value="">Pilih organisasi</option>'+orgOptions(S.orgId)+'</select>'
        : '<div class="card bg-slate-50 mb-4"><small>Organisasi</small><p class="font-bold mt-1">'+esc(currentOrg?.nama||'Belum ada organisasi')+'</p><p class="text-xs text-slate-500 mt-1">'+esc(currentOrg?.tipe||'')+' · konteks akun aktif</p></div>')+
      '<div class="f2"><div><label>Nama program kerja *</label><input id="n" name="nama" required></div><div><label>Jenis</label><select id="j" name="jenis"><option value="sekali">Sekali</option><option value="berulang">Berulang</option></select></div><div><label>Tanggal mulai *</label><input id="m" name="mulai" type="date" required></div><div><label>Tanggal selesai *</label><input id="e" name="selesai" type="date" required></div></div>'+
      '<label>Lokasi *</label><input id="t" name="tempat" required><label>Deskripsi</label><textarea id="d" name="deskripsi" rows="3"></textarea>'+
      '<label>Penyelenggara</label><label><input type="radio" name="pengajuan" value="mandiri" checked style="width:auto"> Mandiri</label><label><input type="radio" name="pengajuan" value="kolaboratif" style="width:auto"> Kolaboratif</label>'+
      '<div id="kb" hidden><label>Dana kampus proker</label><input id="dk" type="number" min="0" value="0"><div id="ps"></div><button type="button" class="btn w" id="tp">+ Tambah peserta</button><p class="sub" id="tt"></p></div>'+
      '<p class="err" id="fe"></p><div class="flex gap-2 mt-4"><button class="btn s" type="button" data-go="proker">Batal</button><button class="btn">Simpan draft</button></div></form>';
  },
  review:function(){
    const d=S.detail;
    if(!d?.proker)return emptyCard('Detail proker tidak ditemukan.','<button class="btn" data-go="proker">Kembali</button>');
    const p=d.proker;
    const proposal=d.docs.find(x=>x.jenis==='proposal');
    const lpj=d.docs.find(x=>x.jenis==='laporan_akhir');
    const readOnlyCollaborator=!!d.readOnlyCollaborator;
    const wakilReadOnly = S.user.peran==='wakil_rektor' && p.organisasi?.tipe!=='BEM';
    const canEdit=!readOnlyCollaborator && S.user.peran!=='wakil_rektor' && S.permissions?.has('proker.edit');
    const canCreate=!readOnlyCollaborator && S.user.peran!=='wakil_rektor' && S.permissions?.has('proker.create');
    const canReview=!readOnlyCollaborator && !wakilReadOnly && (S.permissions?.has('dokumen.review')||S.permissions?.has('laporan.review'));
    const isProposalReview=p.status==='proposal_diajukan'&&proposal&&canReview&&String(p.dibuat_oleh||'')!==String(S.user.id||'');
    const isLpjReview=p.status==='lpj_diajukan'&&lpj&&canReview&&String(p.dibuat_oleh||'')!==String(S.user.id||'');
    const action=(action,label,kind='')=>'<button class="btn '+kind+'" data-proker-action="'+action+'" data-proker-id="'+esc(p.id)+'">'+label+'</button>';
    let actions='';
    if(p.status==='direncanakan'&&(canCreate||canEdit)) actions=proposal?.file_path ? action('submit','Ajukan proposal') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload proposal terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>';
    else if(p.status==='revisi'&&(canCreate||canEdit)) actions=proposal?.file_path ? action('resubmit','Ajukan ulang') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
    else if(p.status==='disetujui'&&canEdit) actions=action('start','Mulai pelaksanaan');
    else if(p.status==='berjalan'&&canEdit) actions=action('finish','Tandai selesai');
    else if(p.status==='selesai'&&canEdit) actions=lpj?.file_path ? action('submit_lpj','Ajukan LPJ') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload LPJ terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>';
    else if(isProposalReview) actions='<div class="w-full"><label>Komentar review</label><textarea id="workflow-comment" rows="3" placeholder="Komentar untuk pengaju, terutama wajib saat revisi."></textarea><div class="flex flex-wrap gap-2 mt-3">'+action('revise','Minta revisi','d')+action('approve','Setujui','')+'</div></div>';
    else if(isLpjReview) actions='<div class="w-full"><label>Komentar review LPJ</label><textarea id="workflow-comment" rows="3" placeholder="Catatan review LPJ"></textarea><div class="flex flex-wrap gap-2 mt-3">'+action('reject_lpj','Kembalikan untuk revisi','d')+action('approve_lpj','Setujui LPJ','')+'</div></div>';

    const steps=[
      ['direncanakan','Direncanakan'],
      ['proposal_diajukan','Review proposal'],
      ['disetujui','Disetujui'],
      ['berjalan','Pelaksanaan'],
      ['selesai','Selesai'],
      ['lpj_diajukan','Review LPJ'],
      ['lpj_disetujui','Selesai administrasi']
    ];
    const currentIndex=Math.max(steps.findIndex(x=>x[0]===p.status),0);
    return pageHeader(
      p.nama,
      S.user.peran==='wakil_rektor'
        ? (p.organisasi?.tipe==='BEM' && ['proposal_diajukan','lpj_diajukan'].includes(p.status)
          ? 'Pengajuan BEM · Wakil Rektor dapat review, setujui, atau revisi.'
          : 'Pemantauan semua organisasi · akses hanya baca.')
        : (readOnlyCollaborator?'Dokumentasi kolaborator · akses hanya baca.':'Alur tindak lanjut program kerja.'),
      chip(p.status)
    )+
      '<div class="card mb-4"><div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">'+steps.map((s,i)=>'<div class="rounded-xl p-3 '+(i<currentIndex?'bg-emerald-50 text-emerald-700':i===currentIndex?'bg-sima-50 text-sima-700':'bg-slate-50 text-slate-400')+'"><div class="text-[11px] font-bold">'+(i+1)+'</div><div class="text-xs mt-1 font-semibold">'+esc(s[1])+'</div></div>').join('')+'</div></div>'+
      '<div class="row2"><div class="card"><h3>Informasi kegiatan</h3><div class="grid grid-cols-2 gap-3 mt-3"><div><small>Organisasi</small><p class="font-semibold">'+esc(p.organisasi?.nama||'-')+'</p></div><div><small>Ketua</small><p class="font-semibold">'+esc(p.ketua_pelaksana||'-')+'</p></div><div><small>Mulai</small><p class="font-semibold">'+dateID(p.tanggal_mulai)+'</p></div><div><small>Selesai</small><p class="font-semibold">'+dateID(p.tanggal_selesai)+'</p></div><div><small>Lokasi</small><p class="font-semibold">'+esc(p.tempat||'-')+'</p></div><div><small>Batas LPJ</small><p class="font-semibold">'+dateID(p.batas_lpj||'Belum aktif')+'</p></div></div><p class="sub mt-4">'+esc(p.deskripsi||'Tidak ada deskripsi.')+'</p></div>'+
      '<div class="card"><h3>Tindak lanjut</h3><p class="sub">Status saat ini: <b>'+esc(ST[p.status]?.[0]||p.status)+'</b></p>'+(actions||'<p class="sub">Belum ada tindakan yang tersedia untuk akun dan status saat ini.</p>')+
        (((S.user.peran!=='wakil_rektor')&&(canEdit||S.user.peran==='admin')&&['draft','direncanakan','revisi'].includes(p.status))?
          '<div class="mt-4 pt-4 border-t border-slate-200"><button class="btn d" data-proker-delete="'+esc(p.id)+'">Hapus proker</button></div>':'')+
      '</div></div>'+
      '<div class="card"><div class="flex items-start justify-between gap-3"><div><h3>Dokumen</h3><p class="sub mb-0">File proposal dan LPJ disimpan di Supabase Storage dan wajib ada sebelum pengajuan.</p></div></div>'+
      ((S.user.peran!=='wakil_rektor')&&(!readOnlyCollaborator)&&(p.status==='direncanakan'||p.status==='revisi')&&(canCreate||canEdit)
        ? '<div class="mt-4 rounded-2xl border border-slate-200 p-4"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">Proposal</p><p class="text-xs text-slate-500">'+(proposal?.file_name?'Sudah diunggah: '+esc(proposal.file_name):'Belum ada file proposal.')+'</p></div><span class="chip '+(proposal?.file_path?'ok':'wa')+'">'+(proposal?.file_path?'Siap diajukan':'Wajib upload')+'</span></div><div class="flex flex-col sm:flex-row gap-2 mt-3"><input id="workflow-file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="flex-1"><button class="btn" data-doc-upload="proposal" data-proker-id="'+esc(p.id)+'">Upload proposal</button>'+(proposal?.file_path?'<button class="btn" data-doc-download="'+esc(proposal.file_path)+'">Lihat file</button><button class="btn d" data-doc-delete="'+esc(proposal.id)+'">Hapus proposal</button>':'')+'</div></div>'
        : '')+
      ((S.user.peran!=='wakil_rektor')&&(!readOnlyCollaborator)&&(p.status==='selesai'||p.status==='lpj_diajukan'||p.status==='lpj_disetujui')&&(canEdit||canReview)
        ? '<div class="mt-4 rounded-2xl border border-slate-200 p-4"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">Laporan akhir / LPJ</p><p class="text-xs text-slate-500">'+(lpj?.file_name?'Sudah diunggah: '+esc(lpj.file_name):'Belum ada file LPJ.')+'</p></div><span class="chip '+(lpj?.file_path?'ok':'wa')+'">'+(lpj?.file_path?'Tersedia':'Wajib upload sebelum pengajuan')+'</span></div><div class="flex flex-col sm:flex-row gap-2 mt-3"><input id="workflow-file-lpj" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="flex-1"><button class="btn" data-doc-upload="laporan_akhir" data-proker-id="'+esc(p.id)+'">Upload LPJ</button>'+(lpj?.file_path?'<button class="btn" data-doc-download="'+esc(lpj.file_path)+'">Lihat file</button><button class="btn d" data-doc-delete="'+esc(lpj.id)+'">Hapus LPJ</button>':'')+'</div></div>'
        : '')+
      (d.docs.length?'<div class="mt-4">'+d.docs.map(doc=>'<div class="py-3 border-b border-slate-100 last:border-0"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">'+esc(doc.jenis)+'</p><p class="text-xs text-slate-500">'+esc(doc.status||'-')+' · '+esc(doc.tahap||'-')+(doc.file_name?' · '+esc(doc.file_name):'')+'</p></div>'+(doc.file_path?'<button class="btn s" data-doc-download="'+esc(doc.file_path)+'">Buka</button>': '<span class="chip wa">Belum ada file</span>')+
        ((doc.file_path && (doc.status==='draft'||doc.status==='revisi'))?'<button class="btn d" data-doc-delete="'+esc(doc.id)+'">Hapus</button>':'')+'</div></div>').join('')+'</div>':'<p class="sub mt-4">Belum ada dokumen.</p>')+
      '</div>'+
      '<div class="row2"><div class="card"><h3>Kolaborator</h3>'+(d.kolaborator.length?d.kolaborator.map(x=>'<div class="py-2 border-b border-slate-100 last:border-0"><p class="text-sm">Organisasi #'+esc(x.organisasi_id)+'</p><p class="text-xs text-slate-500">'+esc(x.status)+' · '+rp(x.porsi_plafon)+'</p></div>').join(''):'<p class="sub">Tidak ada kolaborator.</p>')+'</div><div class="card"><h3>Riwayat persetujuan</h3>'+(d.keputusan.length?d.keputusan.map(x=>'<div class="py-2 border-b border-slate-100 last:border-0"><p class="font-semibold">'+esc(x.keputusan)+' · '+esc(x.tahap)+'</p><p class="text-xs text-slate-500">'+dateID(x.waktu)+'</p><p class="text-sm">'+esc(x.komentar||'')+'</p></div>').join(''):'<p class="sub">Belum ada keputusan.</p>')+'</div></div>';
  },
  undangan:function(){
    return pageHeader('Undangan kolaborasi',S.user.peran==='wakil_rektor'?'Pantauan undangan kolaborasi · akses hanya baca.':'Kelola undangan organisasi untuk program kerja.')+
      (S.undangan.length?'<div class="grid gap-3">'+S.undangan.map(x=>'<div class="card"><div class="flex items-center justify-between gap-3"><div><h3>'+esc(x.proker?.nama||'Program kerja')+'</h3><p class="sub mb-1">'+dateID(x.proker?.tanggal_mulai)+'</p><p class="text-sm">Porsi: <b>'+rp(x.porsi_plafon)+'</b></p></div><div class="flex gap-2"><span class="chip '+(x.status==='bergabung'?'ok':x.status==='menolak'?'er':'wa')+'">'+esc(x.status)+'</span>'+(x.status==='diundang' && S.user.peran!=='wakil_rektor'?'<button class="btn w" data-collab-action="bergabung" data-proker-id="'+esc(x.proker_id)+'" data-org-id="'+esc(x.organisasi_id)+'">Terima</button><button class="btn d" data-collab-action="menolak" data-proker-id="'+esc(x.proker_id)+'" data-org-id="'+esc(x.organisasi_id)+'">Tolak</button>':'')+'</div></div></div>').join('')+'</div>':emptyCard('Belum ada undangan.'));
  },
  inbox:function(){
    return pageHeader('Inbox review','Dokumen yang tersedia untuk ditinjau.')+
      (S.inbox.length?'<div class="grid gap-3">'+S.inbox.map(x=>'<div class="card"><div class="flex items-center justify-between gap-3"><div><h3>'+esc(x.proker?.nama||'Dokumen')+'</h3><p class="sub mb-0">'+esc(x.jenis)+' · '+esc(x.status||'-')+'</p></div><button class="btn" data-go="review" data-proker-id="'+esc(x.proker_id||'')+'">Buka</button></div></div>').join('')+'</div>':emptyCard('Inbox kosong.'));
  },
  galeri:function(){
    return pageHeader('Galeri kegiatan','Dokumentasi kegiatan yang tercatat di SIMA.')+
      (S.gallery.length?'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">'+S.gallery.map(x=>'<div class="card !p-0 overflow-hidden"><div class="h-40 bg-slate-100 grid place-items-center text-slate-400">Foto kegiatan</div><div class="p-4"><p class="font-semibold">'+esc(x.proker?.nama||'Kegiatan')+'</p><p class="text-xs text-slate-500 mt-1">'+esc(x.keterangan||'Tanpa keterangan')+'</p></div></div>').join('')+'</div>':emptyCard('Belum ada foto kegiatan.'));
  },
  laporan:function(){
    return pageHeader('Laporan akhir','Pantau laporan akhir kegiatan.')+
      (S.reports.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Proker</th><th>Status</th><th>Tahap</th><th></th></tr></thead><tbody>'+S.reports.map(x=>'<tr><td><b>'+esc(x.proker?.nama||'-')+'</b></td><td>'+chip(x.status||'draft')+'</td><td>'+esc(x.tahap||'-')+'</td><td><button class="btn s" data-go="review" data-proker-id="'+esc(x.proker_id||'')+'">Buka</button></td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada laporan akhir.'));
  },
  struktur:function(){
    const isPrivileged=['admin','wakil_rektor'].includes(S.user.peran);
    const selectedId=isPrivileged ? (S.structureOrgId||'') : (S.orgId||'');
    const org=(S.organizations||[]).find(o=>o.id===selectedId);
    const type=org?.tipe;
    const units=(S.units||[]).filter(x=>x.organisasi_id===selectedId);
    const parent=(S.organizations||[]).find(o=>o.id===org?.induk_organisasi_id);
    const canUnit=S.user.peran==='admin' || S.permissions?.has('unit.manage');
    const targetOptions=(S.organizations||[])
      .filter(o=>o.tipe==='BEM'||o.tipe==='HMJ')
      .map(o=>'<option value="'+esc(o.id)+'" '+(String(o.id)===String(selectedId)?'selected':'')+'>'+esc(o.nama+' · '+o.tipe)+'</option>')
      .join('');

    let html=pageHeader(
      org ? 'Struktur '+esc(org.nama) : 'Struktur organisasi',
      org ? (type==='BEM' ? 'BEM menggunakan Kementerian.' : type==='HMJ' ? 'HMJ menggunakan Divisi.' : type==='UKM' ? 'UKM memiliki BPH dan koordinator.' : 'Club memiliki pengurus dan anggota.') : 'Pilih organisasi untuk mengelola struktur.'
    );

    if(isPrivileged){
      html+='<div class="card mb-4"><h3>Pilih organisasi</h3><div class="f2"><div><label>Organisasi</label><select id="struktur-org"><option value="">Pilih BEM atau HMJ</option>'+targetOptions+'</select></div><div><label>Jenis unit</label><input readonly value="'+(type==='BEM'?'Kementerian':type==='HMJ'?'Divisi':'-')+'"><small>Jenis unit mengikuti tipe organisasi.</small></div></div></div>';
    }

    if(org){
      html+='<div class="card mb-4"><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><div><small>Tipe</small><p class="font-bold mt-1">'+esc(type)+'</p></div><div><small>Induk</small><p class="font-bold mt-1">'+esc(parent?.nama||'Tidak ada')+'</p></div><div><small>Unit kerja</small><p class="font-bold mt-1">'+units.length+'</p></div><div><small>Mode</small><p class="font-bold mt-1">'+(type==='BEM'?'Kementerian':type==='HMJ'?'Divisi':'Tanpa unit')+'</p></div></div></div>';

      if((type==='BEM'||type==='HMJ')&&canUnit){
        const label=type==='BEM'?'Kementerian':'Divisi';
        const placeholder=type==='BEM'?'Contoh: KOMINFO':'Contoh: Divisi PSDM';
        html+='<div class="card mb-4"><div class="flex items-center justify-between gap-3 mb-3"><div><h3>Kelola '+label+'</h3><p class="sub mb-0">Unit akan otomatis terhubung ke <b>'+esc(org.nama)+'</b>.</p></div><span class="chip bl">'+units.length+' unit</span></div><form id="form-unit" class="rounded-2xl bg-slate-50 p-4"><div class="f2"><div><label>Nama '+label+' *</label><input id="u-nama" required placeholder="'+placeholder+'"></div><div><label>Jenis unit</label><input id="u-jenis" readonly value="'+(type==='BEM'?'kementerian':'divisi')+'"></div></div><button class="btn mt-4">Simpan '+label+'</button></form></div>';
      }

      if(units.length){
        html+='<div class="card mb-4"><h3>Unit kerja</h3><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">'+units.map(x=>'<div class="rounded-2xl border border-slate-200 p-4"><h4 class="font-bold">'+esc(x.nama)+'</h4><p class="text-xs text-slate-500 mt-1">'+esc(x.jenis)+' · '+esc(org.nama)+'</p></div>').join('')+'</div></div>';
      }else if(type==='BEM'||type==='HMJ'){
        html+='<div class="card mb-4"><p class="sub">Belum ada '+(type==='BEM'?'Kementerian.':'Divisi.')+'</p></div>';
      }

      if(type==='BEM'){
        html+='<div class="card mb-4"><h3>Badan Pengurus Harian BEM</h3><p class="sub">Presiden · Wakil Presiden · Sekretaris · Bendahara</p></div>';
      }else if(type==='HMJ'){
        html+='<div class="card mb-4"><h3>Struktur HMJ</h3><p class="sub">Ketua · Wakil Ketua · Sekretaris · Bendahara · Divisi · Ketua Divisi · Staff</p></div>';
      }else if(type==='UKM'){
        html+='<div class="card mb-4"><h3>Struktur UKM</h3><p class="sub">Ketua · Wakil Ketua · Sekretaris · Bendahara · Koordinator dari BEM</p></div>';
      }else if(type==='CLUB'){
        html+='<div class="card mb-4"><h3>Struktur Club</h3><p class="sub">Ketua · Sekretaris · Bendahara · anggota tanpa akun</p></div>';
      }

      if(S.structure.length){
        html+='<div class="card"><h3>Akun anggota</h3><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">'+S.structure.map(x=>'<div class="rounded-2xl border border-slate-200 p-4"><h4 class="font-bold">'+esc(x.user?.nama||'Pengguna')+'</h4><p class="sub mb-1">'+esc(x.jabatan||'-')+'</p><p class="text-sm">'+esc(x.unit?.nama||'BPH/Organisasi')+'</p></div>').join('')+'</div></div>';
      }else{
        html+='<div class="card"><p class="sub">Belum ada akun anggota pada organisasi ini.</p></div>';
      }
    }

    return html;
  },

  rapat:function(){
    const canWrite=['admin','wakil_rektor','pembimbing'].includes(S.user.peran);
    return pageHeader('Rapat','Agenda dan hasil rapat.')+
      (canWrite?'<form id="form-rapat" class="card"><h3>Catat rapat</h3><div class="f2"><div><label>Nomor</label><input id="r-nomor" type="number" min="1"></div><div><label>Tanggal</label><input id="r-tanggal" type="date"></div></div><label>Dokumen ID</label><input id="r-dokumen" required><label>Peserta</label><textarea id="r-peserta" rows="2"></textarea><label>Notulen</label><textarea id="r-notulen" rows="3"></textarea><label>Hasil</label><select id="r-hasil"><option value="lanjut">Lanjut</option><option value="revisi">Revisi</option></select><button class="btn mt-4">Simpan</button></form>':'')+
      (S.meetings.length?'<div class="grid gap-3">'+S.meetings.map(x=>'<div class="card"><div class="flex justify-between gap-3"><div><h3>Rapat #'+esc(x.nomor||'-')+'</h3><p class="sub mb-1">'+dateID(x.tanggal)+' · '+esc(x.dokumen_id)+'</p></div>'+chip(x.hasil||'-')+'</div><p class="text-sm">'+esc(x.notulen||'Belum ada notulen.')+'</p></div>').join('')+'</div>':emptyCard('Belum ada rapat.'));
  },
  plafon:function(){
    const canWrite=['admin','wakil_rektor','staf_keuangan'].includes(S.user.peran);
    return pageHeader('Plafon dan anggaran','Kelola plafon anggaran organisasi.')+
      (canWrite?'<form id="form-plafon" class="card"><h3>Atur plafon</h3><div class="f2"><div><label>Organisasi</label><select id="p-org" required><option value="">Pilih organisasi</option>'+orgOptions(S.orgId)+'</select></div><div><label>Jumlah</label><input id="p-jumlah" type="number" min="0" required></div></div><button class="btn mt-4">Simpan plafon</button></form>':'')+
      (S.budgets.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Organisasi</th><th>Plafon</th><th>Terakhir diinput</th></tr></thead><tbody>'+S.budgets.map(x=>'<tr><td>'+esc(x.organisasi?.nama||'-')+'</td><td>'+rp(x.jumlah)+'</td><td>'+dateID(x.diinput_pada)+'</td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada plafon.'));
  },
  cair:function(){
    const canWrite=['admin','wakil_rektor','staf_keuangan'].includes(S.user.peran);
    return pageHeader('Pencairan dan verifikasi','Catat pencairan dana dan sumber pembiayaannya.')+
      (canWrite?'<form id="form-cair" class="card"><h3>Catat pencairan</h3><div class="f2"><div><label>Proker</label><select id="c-proker" required><option value="">Pilih proker</option>'+S.proker.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+'</option>').join('')+'</select></div><div><label>Sumber dana</label><select id="c-sumber" required><option value="">Pilih sumber dana</option>'+(S.sources||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.kode+' · '+x.nama)+'</option>').join('')+'</select></div><div><label>Jumlah</label><input id="c-jumlah" type="number" min="1" required></div><div><label>Tanggal</label><input id="c-tanggal" type="date"></div><div><label>Tahap</label><input id="c-tahap" type="number" min="1" value="1"></div></div><button class="btn mt-4">Simpan</button></form>':'')+
      (S.payouts.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Proker</th><th>Sumber</th><th>Jumlah</th><th>Tanggal</th><th>Tahap</th></tr></thead><tbody>'+S.payouts.map(x=>'<tr><td>'+esc(x.proker?.nama||'-')+'</td><td>'+esc(x.sumber?.nama||'-')+'</td><td>'+rp(x.jumlah)+'</td><td>'+dateID(x.tanggal)+'</td><td>'+esc(x.tahap||'-')+'</td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada pencairan.'));
  },
  organisasi:function(){
    const canWrite=['admin','wakil_rektor'].includes(S.user.peran);
    const hasPeriods=Array.isArray(S.periods)&&S.periods.length>0;
    const currentOrg=(S.organizations||[]).find(o=>o.id===S.orgId);
    const bems=(S.organizations||[]).filter(o=>o.tipe==='BEM');
    const related=(S.organizationRelations||[]).filter(r=>r.organisasi_id===S.orgId||r.terhubung_dengan_id===S.orgId);

    const connectionCard=currentOrg?.tipe==='CLUB' && (S.permissions?.has('organisasi.relation.manage')||canWrite)
      ? '<div class="card mt-4"><h3>Koneksi Club</h3><p class="sub">Club dapat terhubung ke BEM, HMJ, UKM, atau Club lain.</p>'+
        '<form id="form-club-relasi"><select id="cr-org" required><option value="">Pilih organisasi terhubung</option>'+
        (S.organizations||[]).filter(o=>o.id!==currentOrg.id).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+o.tipe)+'</option>').join('')+
        '</select><button class="btn mt-3">Tambah koneksi</button></form>'+
        (related.length?'<div class="grid sm:grid-cols-2 gap-2 mt-4">'+related.map(r=>{
          const partner=r.organisasi_id===currentOrg.id?r.terhubung:r.organisasi;
          return '<div class="rounded-xl bg-slate-50 p-3 text-sm">'+esc(partner?.nama||'-')+' · '+esc(partner?.tipe||'-')+'</div>';
        }).join('')+'</div>':'<p class="sub mt-3">Belum ada koneksi.</p>')+
        '</div>'
      : '';

    const createForm=!hasPeriods
      ? '<div class="card border border-amber-200 bg-amber-50"><h3 class="!text-amber-900">Belum ada periode</h3><p class="sub !text-amber-800">Buat periode terlebih dahulu.</p></div>'
      : (canWrite
        ? '<form id="form-organisasi" class="card"><h3>Tambah organisasi</h3>'+
          '<div class="f2"><div><label>Nama *</label><input id="o-nama" required></div>'+
          '<div><label>Tipe *</label><select id="o-tipe" required><option value="">Pilih tipe</option><option value="BEM">BEM</option><option value="HMJ">HMJ</option><option value="UKM">UKM</option><option value="CLUB">CLUB</option></select></div>'+
          '<div><label>Periode *</label><select id="o-periode" required><option value="">Pilih periode</option>'+
          S.periods.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama+' · '+x.status)+'</option>').join('')+
          '</select></div></div>'+
          '<div id="o-parent-wrap" hidden><label>Naungan BEM *</label><select id="o-parent"><option value="">Pilih BEM</option>'+
          bems.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+'</option>').join('')+
          '</select></div>'+
          '<div id="o-relasi-wrap" hidden><label>Koneksi Club</label><select id="o-relasi" multiple class="min-h-32">'+
          (S.organizations||[]).filter(o=>['BEM','HMJ','UKM','CLUB'].includes(o.tipe)).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+o.tipe)+'</option>').join('')+
          '</select><small>Club dapat terhubung ke satu atau banyak organisasi.</small></div>'+
          '<button class="btn mt-4">Simpan organisasi</button></form>'
        : '');

    const orgList=S.organizations.length
      ? '<div class="grid gap-3 mt-4">'+S.organizations.map(x=>{
          const parent=(S.organizations||[]).find(o=>o.id===x.induk_organisasi_id);
          return '<div class="card"><div class="flex items-start justify-between gap-3"><div><h3>'+esc(x.nama)+'</h3>'+
            '<p class="sub mb-1">'+esc(x.tipe)+'</p>'+
            '<p class="text-xs text-slate-500">'+(parent?'Di bawah '+esc(parent.nama):(x.tipe==='CLUB'?'Club multi-koneksi':'Organisasi utama'))+'</p></div>'+
            '<span class="chip bl">'+esc(x.tipe)+'</span></div></div>';
        }).join('')+'</div>'
      : emptyCard('Belum ada organisasi.');

    return pageHeader('Organisasi','Buat dan kelola BEM, HMJ, UKM, serta Club.',
      currentOrg?.tipe==='CLUB'?'<button class="btn" data-go="struktur">Kelola struktur Club</button>':'')+
      createForm+connectionCard+orgList;
  },

  unit_kerja:function(){
    return V.struktur();
  },

  periode:function(){
    const canWrite=['admin','wakil_rektor'].includes(S.user.peran);
    return pageHeader('Periode','Tentukan siklus periode dan berapa hari batas LPJ setelah proker mulai berjalan.')+
      (canWrite?'<form id="form-periode" class="card"><h3>Buat periode</h3><div class="f2"><div><label>Nama periode *</label><input id="pe-nama" required></div><div><label>Batas LPJ (hari) *</label><input id="pe-batas-hari" type="number" min="1" max="365" value="7" required><small>Deadline LPJ dihitung otomatis saat status proker berubah menjadi <b>Berjalan</b>.</small></div></div><label>Status periode</label><select id="pe-status"><option value="disiapkan">Disiapkan</option><option value="aktif">Aktif</option><option value="masa_lpj">Masa LPJ</option><option value="arsip">Arsip</option></select><button class="btn mt-4">Simpan periode</button></form>':'')+
      (S.periods.length?'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">'+S.periods.map(x=>'<div class="card"><div class="flex justify-between gap-3"><h3>'+esc(x.nama)+'</h3>'+chip(x.status)+'</div><p class="sub">Batas LPJ: <b>'+esc(x.batas_lpj_hari ?? '-')+' hari</b> setelah proker mulai berjalan.</p></div>').join('')+'</div>':emptyCard('Belum ada periode.'));
  },
  jabatan:function(){
    if(S.user.peran!=='admin') return emptyCard('Akses hanya untuk administrator.');
    return pageHeader('Jabatan & hak akses','Atur modul yang dapat digunakan oleh setiap jabatan organisasi.')+
      '<div class="grid gap-4">'+
      (S.positions||[]).map(j=>{
        const selected=S.permissionMatrix?.[j.id]||new Set();
        return '<form class="card" data-role-form="'+esc(j.id)+'"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"><div><h3>'+esc(j.nama)+'</h3><p class="sub mb-0">'+esc(j.kode)+' · '+esc(j.cakupan)+(j.unit_wajib?' · wajib divisi':'')+'</p></div><button class="btn" type="submit">Simpan hak akses</button></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">'+Object.entries(PERMISSION_CATALOG).map(([code,label])=>'<label class="rounded-xl border border-slate-200 px-3 py-2 text-sm flex items-center gap-2"><input type="checkbox" name="perm" value="'+esc(code)+'" '+(selected.has(code)?'checked':'')+' style="width:auto">'+esc(label)+'</label>').join('')+'</div></form>';
      }).join('')+'</div>';
  },

  koordinator:function(){
    const current=(S.organizations||[]).find(o=>o.id===S.orgId);
    const bemId=current?.tipe==='BEM'?current.id:current?.induk_organisasi_id;
    const ukms=(S.organizations||[]).filter(o=>o.tipe==='UKM' && (!bemId || o.induk_organisasi_id===bemId));
    const canManage=S.user.peran!=='admin' && S.permissions?.has('koordinator.manage');
    return pageHeader('Koordinator UKM','Koordinator ditunjuk oleh Presiden BEM dari seluruh anggota aktif BEM.')+
      (S.user.peran==='admin'?'<div class="card border border-amber-200 bg-amber-50 mb-4"><p class="text-sm text-amber-900">Administrator dapat melihat data, tetapi penunjukan koordinator tetap harus dilakukan oleh Presiden BEM.</p></div>':'')+
      (ukms.length?'<div class="grid gap-4">'+ukms.map(u=>{
        const active=S.coordinatorAssignments.find(x=>x.organisasi_id===u.id);
        return '<div class="card"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h3>'+esc(u.nama)+'</h3><p class="sub">UKM di bawah '+esc((S.organizations||[]).find(o=>o.id===u.induk_organisasi_id)?.nama||'BEM')+'</p><p class="text-sm">Koordinator: <b>'+esc(active?.akun?.nama||'Belum ditunjuk')+'</b></p></div>'+
          (canManage?'<form class="flex gap-2" data-koordinator-form="'+esc(u.id)+'"><select name="akun_id" required><option value="">Memuat anggota BEM…</option></select><button class="btn">Tunjuk</button></form>':'')+
          '</div></div>';
      }).join('')+'</div>':emptyCard('Belum ada UKM pada BEM yang dipilih.'));
  },

  audit:function(){
    return pageHeader('Jejak audit','Riwayat perubahan penting dalam sistem.')+
      (S.audit.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Waktu</th><th>Akun</th><th>Aksi</th><th>Objek</th><th>ID</th></tr></thead><tbody>'+S.audit.map(x=>'<tr><td>'+dateID(x.waktu)+'</td><td>'+esc(x.akun?.nama||x.akun_id||'-')+'</td><td>'+esc(x.aksi||'-')+'</td><td>'+esc(x.objek||'-')+'</td><td class="text-xs">'+esc(x.objek_id||'-')+'</td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada jejak audit.'));
  },
  profil:function(){
    return '<div class="max-w-5xl"><div class="mb-6"><h1 class="t">Profil & organisasi</h1><p class="sub">Kelola identitas akun dan organisasi Anda.</p></div><div class="grid gap-4 lg:grid-cols-[1.05fr_.95fr]"><form id="form-profile" class="card"><div class="flex gap-4 items-center pb-5 border-b border-slate-100"><div id="profileAvatarPreview">'+avatarMarkup(S.user,'h-24 w-24')+'</div><div><h3>Foto profil</h3><p class="sub mb-3">JPG/PNG disarankan.</p><label class="btn cursor-pointer">Ganti<input id="profileAvatar" type="file" accept="image/*" class="hidden"></label></div></div><div class="grid gap-4 sm:grid-cols-2 mt-5"><div><label>Nama lengkap</label><input id="profileName" value="'+esc(S.user.nama)+'" required></div><div><label>NIM</label><input id="profileNim" value="'+esc(S.user.nim||'')+'"></div><div class="sm:col-span-2"><label>Email</label><input value="'+esc(S.user.email)+'" disabled></div></div><button class="btn full mt-4">Simpan perubahan</button></form><div class="card"><h3>Organisasi & jabatan</h3><p class="sub">Keanggotaan akun.</p>'+((S.memberships||[]).length?S.memberships.map(m=>{const o=(S.organizations||[]).find(x=>x.id===m.organisasi_id);return '<div class="rounded-xl bg-slate-50 p-4 mb-3"><p class="font-bold">'+esc(o?.nama||'Organisasi')+'</p><p class="text-sm text-slate-500">'+esc(m.jabatan||'Anggota')+' · '+esc(m.status||'-')+'</p></div>';}).join(''):'<p class="sub">Belum ada organisasi.</p>')+'</div></div></div>';
  },
  akun:function(){
    const orgOpts=(S.organizations||[]).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+o.tipe)+'</option>').join('');
    const jabatanOpts=(S.positions||[]).map(j=>'<option value="'+esc(j.kode)+'">'+esc(j.nama)+'</option>').join('');
    const unitOpts=(S.units||[]).map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nama+' · '+u.jenis)+'</option>').join('');
    return pageHeader('Akun dan penetapan','Akun dapat menjadi anggota banyak organisasi. Setiap organisasi mempunyai jabatan dan ruang lingkupnya sendiri.')+
      '<div class="row2"><div class="card"><h3>Buat akun</h3><form id="form-akun"><label>Nama lengkap *</label><input id="an-nama" required><label>Email *</label><input id="an-email" type="email" required><label>NIM *</label><input id="an-nim" required><label>Role aplikasi *</label><select id="an-peran" required><option value="user">User</option><option value="mahasiswa">Mahasiswa</option><option value="pembimbing">Pembimbing</option><option value="staf_keuangan">Staf Keuangan</option><option value="wakil_rektor">Wakil Rektor</option><option value="admin">Admin</option></select><label>Organisasi awal</label><select id="an-org"><option value="">Pilih organisasi</option>'+orgOpts+'</select><label>Jabatan organisasi</label><select id="an-jabatan"><option value="">Pilih organisasi dulu</option></select><label id="an-unit-label">Unit kerja</label><select id="an-unit" disabled><option value="">Pilih jabatan terlebih dahulu</option></select><small>Setelah akun dibuat, akun yang sama bisa ditambahkan ke organisasi lain melalui Penetapan tambahan.</small><button class="btn full mt-4">Buat akun</button></form></div>'+
      '<div class="card"><h3>Penetapan tambahan</h3><form id="form-penetapan"><label>Akun *</label><select id="p-akun" required><option value="">Pilih akun</option>'+(S.accounts||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+' · '+esc(x.email)+'</option>').join('')+'</select><label>Organisasi *</label><select id="p-org" required><option value="">Pilih organisasi</option>'+orgOpts+'</select><label>Jabatan *</label><select id="p-jabatan" required><option value="">Pilih organisasi dulu</option></select><label id="p-unit-label">Unit kerja</label><select id="p-unit" disabled><option value="">Pilih jabatan terlebih dahulu</option></select><button class="btn full mt-4">Tambahkan ke organisasi</button></form></div></div>'+
      (S.revealedCredential?'<div class="card border border-amber-200 bg-amber-50 mb-4"><div class="flex items-start justify-between gap-3"><div><h3>Password sementara</h3><p class="sub !text-amber-900">Password lama tidak bisa dibaca kembali. Ini adalah password sementara baru yang baru saja direset dan wajib diganti saat login.</p><p class="font-bold">'+esc(S.revealedCredential.nama||S.revealedCredential.email||'Akun')+'</p></div><button class="text-sm underline" data-account-action="close-credential">Tutup</button></div><div class="flex gap-2 mt-3"><input readonly value="'+esc(S.revealedCredential.password)+'" id="revealed-password" class="font-mono flex-1"><button class="btn" data-account-action="copy-credential">Salin</button></div></div>':'')+
      (S.accounts?.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Penetapan organisasi</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>'+S.accounts.map(x=>{
        const actionButtons='<div class="flex flex-wrap gap-2 min-w-[260px]">'+
          '<button class="btn" data-account-action="reset-password" data-account-id="'+esc(x.id)+'">Reset & tampilkan password</button>'+
          (x.aktif?'<button class="btn" data-account-action="deactivate" data-account-id="'+esc(x.id)+'">Nonaktifkan</button>':'<button class="btn" data-account-action="activate" data-account-id="'+esc(x.id)+'">Aktifkan</button>')+
          '<button class="btn" data-account-action="delete" data-account-id="'+esc(x.id)+'">Hapus akun</button>'+
          '</div>';
        return '<tr><td><b>'+esc(x.nama)+'</b></td><td>'+esc(x.email)+'</td><td>'+roleChip(x.peran)+'</td><td>'+((x.memberships||[]).length?x.memberships.map(m=>'<div class="mb-2 last:mb-0"><b>'+esc(m.organisasiInfo?.nama||'-')+'</b> · '+esc(m.jabatanInfo?.nama||m.jabatan||'-')+(m.unitInfo?.nama?' · '+esc(m.unitInfo.nama):'')+'</div>').join(''):(x.unitInfo?'<div class="mb-2"><b>Unit kerja:</b> '+esc(x.unitInfo.nama)+'</div>':'Belum ditetapkan'))+'</td><td>'+(x.aktif?'<span class="chip ok">Aktif</span>':'<span class="chip er">Nonaktif</span>')+'</td><td>'+actionButtons+'</td></tr>';
      }).join('')+'</tbody></table></div>':emptyCard('Belum ada akun.'))+
      (S.lastCredentials?.length?'<div class="card"><h3>Password sementara dari import terakhir</h3><p class="sub">Disimpan hanya di memori halaman.</p><div class="overflow-x-auto"><table><thead><tr><th>Nama</th><th>Email</th><th>Password</th></tr></thead><tbody>'+S.lastCredentials.map(x=>'<tr><td>'+esc(x.nama)+'</td><td>'+esc(x.email)+'</td><td><code>'+esc(x.temporary_password)+'</code></td></tr>').join('')+'</tbody></table></div></div>':'');
  },
  ganti_sandi:function(){
    return pageHeader('Ganti kata sandi','Password sementara wajib diganti sebelum melanjutkan.')+
      '<form id="form-ganti-pw" class="card" style="max-width:430px"><label>Password baru</label><input type="password" id="pw-baru" minlength="10" required><p class="sub">Minimal 10 karakter.</p><button class="btn full">Simpan password</button></form>';
  }
};

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
  const viewFn = V[S.view] || (() => emptyCard('Modul tidak tersedia.'));
  root.innerHTML = storageAdminBanner() + viewFn();
  if (S.view === 'form') pesertaRow(true);
  renderShell();
  if(S.view==='akun')syncSpecialAccountRole();

  if(S.view==='koordinator'){
    document.querySelectorAll('[data-koordinator-form]').forEach(async form=>{
      const ukmId=form.dataset.koordinatorForm;
      const select=form.querySelector('select[name="akun_id"]');
      if(!select || S.user.peran==='admin')return;
      const {data,error}=await sb.functions.invoke('ukm-coordinator',{body:{action:'candidates',ukm_id:ukmId}});
      const candidates=data?.candidates||[];
      if(!error&&data?.ok){
        select.innerHTML='<option value="">Pilih anggota BEM</option>'+candidates.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+' · '+esc(x.nim||'-')+'</option>').join('');
      } else {
        select.innerHTML='<option value="">Gagal memuat kandidat</option>';
      }
    });
  }
}

function pesertaRow(reset) {
  const box=$('#ps'); if(!box)return;
  if(reset)box.innerHTML='';
  const options=(S.organizations||[]).filter(o=>String(o.id)!==String(S.orgId)).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+o.tipe)+'</option>').join('');
  box.insertAdjacentHTML('beforeend','<div class="peserta"><select aria-label="Organisasi peserta" data-org-id><option value="">Pilih organisasi peserta</option>'+options+'</select><input type="number" min="0" placeholder="Porsi Rp" aria-label="Porsi plafon"><button type="button" class="btn d" data-del aria-label="Hapus peserta">×</button></div>');
}

function totalPorsi() { return [...document.querySelectorAll('.peserta input[type=number]')].reduce((a, i) => a + (+i.value || 0), 0); }

function hitung() { 
  const dk = +$('#dk')?.value || 0, tp = totalPorsi(); 
  if ($('#tt')) $('#tt').textContent = `Porsi peserta ${rp(tp)} dari ${rp(dk)}. Beban penyelenggara utama ${rp(Math.max(dk - tp, 0))}.`; 
  return tp <= dk; 
}

// --- Fungsi CSV ---
function parseCSVLine(line) {
  const out=[];let cur='';let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){cur+='"';i++;continue;}
      quoted=!quoted;continue;
    }
    if(ch===','&&!quoted){out.push(cur.trim());cur='';continue;}
    cur+=ch;
  }
  out.push(cur.trim());
  return out;
}

function bacaCSV(file) {
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=String(e.target.result||'').replace(/\r/g,'');
    const lines=text.split('\n').filter(x=>x.trim());
    const rows=lines.map(parseCSVLine).filter(r=>r.some(Boolean));
    S.csvData=rows;
    const preview=$('#csv-preview');
    if(preview)preview.innerHTML=rows.slice(0,50).map((r,i)=>'<div>'+esc((i+1)+'. '+(r[0]||'-')+' ('+(r[1]||'-')+') · '+(r[3]||'mahasiswa'))+'</div>').join('');
    const btn=$('#btn-csv');if(btn)btn.disabled=rows.length===0;
  };
  reader.readAsText(file,'utf-8');
}

async function prosesBulkCSV() {
  if(!sb)return toast('Supabase belum dikonfigurasi.');
  if(S.user.peran!=='admin')return toast('Hanya administrator yang boleh membuat akun.');
  let sukses=0,gagal=0;const credentials=[];
  for(const row of S.csvData){
    const [nama,email,nim,peran,organisasi_id,jabatan_kode,unit_id]=row;
    if(!email||!nama||!nim){gagal++;continue;}
    try{
      const {data,error}=await sb.functions.invoke('admin-create-user',{body:{nama,email:email.trim().toLowerCase(),nim,peran:peran||'user',organisasi_id:organisasi_id||null,jabatan_kode:jabatan_kode||null,unit_id:unit_id||null}});
      if(error||!data?.ok){console.error(error||data);gagal++;continue;}
      credentials.push({nama,email,temporary_password:data.temporary_password});sukses++;
    }catch(error){console.error(error);gagal++;}
  }
  S.lastCredentials=credentials;S.csvData=[];
  toast('Selesai: '+sukses+' sukses, '+gagal+' gagal.');
  if(credentials.length)console.table(credentials);
  return render();
}

// --- Event Listeners ---
document.addEventListener('click', async e => {
  if (e.target.closest('#backBtn')) return goBack();

  if (e.target.closest('#notifBtn')) {
    const p=$('#notifPanel');
    if(p)p.hidden=!p.hidden;
    const m=$('#profileMenu'); if(m)m.hidden=true;
    return;
  }

  if (e.target.closest('#profileBtn')) {
    const m=$('#profileMenu');
    if(m)m.hidden=!m.hidden;
    const p=$('#notifPanel'); if(p)p.hidden=true;
    return;
  }

  const notif=e.target.closest('[data-notif]');
  if(notif){
    if(notif.dataset.notif==='read-all'){
      S.notifications.forEach(n=>n.read=true);
      if(sb&&S.user.id) await sb.from('notifikasi').update({dibaca:true}).eq('akun_id',S.user.id);
      renderNotificationPanel();
      return;
    }
    if(notif.dataset.notif==='open'){
      const n=S.notifications.find(x=>String(x.id)===String(notif.dataset.id));
      if(n){
        n.read=true;
        if(sb&&n.id) await sb.from('notifikasi').update({dibaca:true}).eq('id',n.id).eq('akun_id',S.user.id);
        if($('#notifPanel'))$('#notifPanel').hidden=true;
        if(n.view)navigate(n.view);
        else renderNotificationPanel();
      }
      return;
    }
  }

  const profileAction=e.target.closest('[data-profile-action]');
  if(profileAction){
    if($('#profileMenu'))$('#profileMenu').hidden=true;
    if(profileAction.dataset.profileAction==='profile')return navigate('profil');
    if(profileAction.dataset.profileAction==='logout')return logout();
  }

  const accountAction=e.target.closest('[data-account-action]');
  if(accountAction){
    const action=accountAction.dataset.accountAction;

    if(action==='close-credential'){
      S.revealedCredential=null;
      return render();
    }

    if(action==='copy-credential'){
      const value=S.revealedCredential?.password||'';
      if(!value)return;
      try{
        await navigator.clipboard.writeText(value);
        toast('Password sementara disalin.');
      }catch(_){
        toast('Gagal menyalin. Silakan salin manual.');
      }
      return;
    }

    if(!sb||!accountAction.dataset.accountId)return;
    const targetId=accountAction.dataset.accountId;
    const target=S.accounts.find(x=>String(x.id)===String(targetId));
    if(!target)return toast('Akun tidak ditemukan.');

    if(action==='delete'){
      const ok=window.confirm('Hapus akun '+(target.nama||target.email)+' secara permanen? Login akan dihapus dan akses organisasi akun ini dicabut. Data histori yang masih dibutuhkan akan dipertahankan tanpa identitas akun.');
      if(!ok)return;
    }

    if(action==='deactivate'){
      const ok=window.confirm('Nonaktifkan akun '+(target.nama||target.email)+'? Pengguna tidak dapat login sampai akun diaktifkan kembali.');
      if(!ok)return;
    }

    try{
      const {data,error}=await sb.functions.invoke('admin-account-actions',{
        body:{action:action==='reset-password'?'reset_password':action,target_user_id:targetId}
      });

      if(error||!data?.ok){
        return toast(data?.error||error?.message||'Tindakan akun gagal.');
      }

      if(action==='reset-password'){
        S.revealedCredential={id:targetId,nama:target.nama,email:target.email,password:data.temporary_password};
        toast('Password sementara baru berhasil dibuat.');
      }else if(action==='delete'){
        S.revealedCredential=null;
        toast('Akun dihapus.');
      }else if(action==='deactivate'){
        S.revealedCredential=null;
        toast('Akun dinonaktifkan.');
      }else if(action==='activate'){
        toast('Akun diaktifkan kembali.');
      }

      await loadAccounts();
      return render();
    }catch(error){
      return toast('Tindakan akun gagal: '+(error?.message||'Terjadi kesalahan.'));
    }
  }

  const collab=e.target.closest('[data-collab-action]');
  if(collab){
    if(!sb)return toast('Supabase belum tersedia.');
    const status=collab.dataset.collabAction;
    const {error}=await sb.from('proker_kolaborator')
      .update({status})
      .eq('proker_id',collab.dataset.prokerId)
      .eq('organisasi_id',collab.dataset.orgId);
    if(error)return toast('Gagal memperbarui undangan: '+error.message);
    toast(status==='bergabung'?'Undangan diterima.':'Undangan ditolak.');
    return render();
  }

  const reviewDoc=e.target.closest('[data-review-doc]');
  if(reviewDoc){
    S.reviewDocId=reviewDoc.dataset.reviewDoc;
    toast('Dokumen dipilih untuk ditinjau.');
    return;
  }

  const prokerRef=e.target.closest('[data-proker-id]');
  if(prokerRef) S.selectedProkerId=prokerRef.dataset.prokerId;

  const go=e.target.closest('[data-go]');
  if(go)return navigate(go.dataset.go);

  const tab=e.target.closest('[data-tab]');
  if(tab){S.tab=tab.dataset.tab;return render();}

  if(e.target.id==='tp'){pesertaRow();return hitung();}
  if(e.target.closest('[data-del]')){e.target.closest('.peserta')?.remove();return hitung();}
  if(e.target.id==='btn-csv')return prosesBulkCSV();

  const prokerDelete=e.target.closest('[data-proker-delete]');
  if(prokerDelete){
    if(!sb)return toast('Supabase belum tersedia.');
    const id=prokerDelete.dataset.prokerDelete;
    if(!id)return;
    const p=S.detail?.proker;
    const ok=window.confirm('Hapus proker "'+(p?.nama||'ini')+'"? Proker yang masih direncanakan/revisi akan dihapus beserta dokumen dan data turunannya. Tindakan ini tidak dapat dibatalkan.');
    if(!ok)return;
    const {data,error}=await sb.rpc('delete_proker_draft',{p_proker_id:id});
    if(error)return toast('Proker tidak dapat dihapus: '+(error.message||'Terjadi kesalahan.'));
    const paths=(data||[]).map(x=>x.file_path).filter(Boolean);
    if(paths.length)await sb.storage.from('documents').remove(paths);
    S.selectedProkerId=null;
    toast('Proker berhasil dihapus.');
    navigate('proker');
    return;
  }

  const docDelete=e.target.closest('[data-doc-delete]');
  if(docDelete){
    if(!sb)return toast('Supabase belum tersedia.');
    const id=docDelete.dataset.docDelete;
    const doc=(S.detail?.docs||[]).find(x=>String(x.id)===String(id));
    const ok=window.confirm('Hapus file "'+(doc?.file_name||'dokumen ini')+'"? File akan dihapus dari Storage dan data dokumennya.');
    if(!ok)return;
    const {data,error}=await sb.rpc('delete_proker_document',{p_document_id:id});
    if(error)return toast('Dokumen tidak dapat dihapus: '+(error.message||'Terjadi kesalahan.'));
    const paths=(data||[]).map(x=>x.file_path).filter(Boolean);
    if(paths.length)await sb.storage.from('documents').remove(paths);
    await loadProkerDetail();
    toast('Dokumen berhasil dihapus.');
    return render();
  }

  const docUpload=e.target.closest('[data-doc-upload]');
  if(docUpload){
    if(!sb)return toast('Supabase belum tersedia.');
    const prokerId=docUpload.dataset.prokerId;
    const kind=docUpload.dataset.docUpload;
    const input=kind==='laporan_akhir'?$('#workflow-file-lpj'):$('#workflow-file');
    const file=input?.files?.[0];
    if(!file)return toast('Pilih file terlebih dahulu.');

    const allowed=[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(!allowed.includes(file.type)&&!['pdf','doc','docx'].includes(ext)){
      return toast('Format file harus PDF, DOC, atau DOCX.');
    }
    if(file.size>15*1024*1024)return toast('Ukuran file maksimal 15 MB.');

    const proker=S.detail?.proker;
    if(!proker?.organisasi_id)return toast('Organisasi proker tidak ditemukan.');

    const quota=await loadStorageStatus(file.size);
    if(quota && !quota.can_upload){
      return toast('Penyimpanan SIMA tidak cukup untuk file ini. Upload dihentikan.');
    }

    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=proker.organisasi_id+'/'+prokerId+'/'+kind+'/'+Date.now()+'_'+safeName;
    const bucket=sb.storage.from('documents');
    const up=await bucket.upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});
    if(up.error)return toast('Upload dokumen gagal: '+up.error.message);

    const existing=S.detail.docs.find(x=>x.jenis===kind);
    let dbResult;
    const payload={
      organisasi_id:proker.organisasi_id,
      proker_id:prokerId,
      jenis:kind,
      status:'draft',
      tahap:null,
      file_path:path,
      file_name:file.name,
      mime_type:file.type||null,
      file_size:file.size,
      uploaded_by:S.user.id,
      uploaded_at:new Date().toISOString()
    };
    if(existing){
      dbResult=await sb.from('dokumen').update(payload).eq('id',existing.id);
      if(dbResult.error){
        await bucket.remove([path]);
        return toast('Metadata dokumen gagal disimpan: '+dbResult.error.message);
      }
      if(existing.file_path&&existing.file_path!==path)await bucket.remove([existing.file_path]);
    }else{
      dbResult=await sb.from('dokumen').insert(payload);
      if(dbResult.error){
        await bucket.remove([path]);
        return toast('Metadata dokumen gagal disimpan: '+dbResult.error.message);
      }
    }

    await loadStorageStatus();
    await loadProkerDetail();
    toast(kind==='proposal'?'Proposal berhasil diunggah.':'LPJ berhasil diunggah.');
    return render();
  }

  const docPrint=e.target.closest('[data-doc-print]');
  if(docPrint){
    if(!S.detail?.readOnlyCollaborator)return toast('Aksi cetak ini hanya untuk kolaborator.');
    const path=docPrint.dataset.docPrint;
    const doc=(S.detail?.docs||[]).find(x=>x.file_path===path);
    if(!doc||doc.status!=='disetujui')return toast('Hanya dokumen final yang dapat dicetak.');
    const {data,error}=await sb.storage.from('documents').createSignedUrl(path,600);
    if(error||!data?.signedUrl)return toast('Gagal membuka dokumen final: '+(error?.message||''));
    const win=window.open(data.signedUrl,'_blank','noopener,noreferrer');
    if(win)toast('Dokumen final dibuka. Gunakan perintah Cetak pada penampil dokumen.');
    return;
  }

  const docDownload=e.target.closest('[data-doc-download]');
  if(docDownload){
    const path=docDownload.dataset.docDownload;
    if(!path)return;
    const {data,error}=await sb.storage.from('documents').createSignedUrl(path,600);
    if(error||!data?.signedUrl)return toast('Gagal membuat link dokumen: '+(error?.message||'Tidak dapat mengakses file.'));
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
    return;
  }

  const workflow=e.target.closest('[data-proker-action]');
  if(workflow){
    if(!sb)return toast('Supabase belum tersedia.');
    const action=workflow.dataset.prokerAction;
    const prokerId=workflow.dataset.prokerId||S.selectedProkerId;
    if(!prokerId)return toast('Proker tidak ditemukan.');
    const comment=$('#workflow-comment')?.value?.trim()||null;
    const {data,error}=await sb.rpc('transition_proker',{p_proker_id:prokerId,p_action:action,p_comment:comment});
    if(error)return toast('Tindakan gagal: '+(error.message||'Tidak dapat memproses alur proker.'));
    if(data?.status)toast('Status proker diperbarui menjadi: '+(ST[data.status]?.[0]||data.status));
    S.selectedProkerId=prokerId;
    return render();
  }

  const act=e.target.closest('[data-act]');
  if(act){
    if(!sb)return toast('Supabase belum tersedia.');
    const action=act.dataset.act==='revisi'?'revise':act.dataset.act==='setuju'?'approve':act.dataset.act;
    const k=($('#kk')?.value||'').trim()||null;
    const prokerId=S.selectedProkerId;
    if(!prokerId)return toast('Proker tidak ditemukan.');
    const {data,error}=await sb.rpc('transition_proker',{p_proker_id:prokerId,p_action:action,p_comment:k});
    if(error)return toast('Review gagal: '+(error.message||'Tidak dapat memproses review.'));
    toast('Review tersimpan.');
    return render();
  }
});

document.addEventListener('input', e => {
  if(e.target.id==='q'){
    S.q=e.target.value;
    clearTimeout(S.searchTimer);
    S.searchTimer=setTimeout(()=>render(),220);
  }
  if(e.target.closest('#kb'))hitung();
});

document.addEventListener('change', async e => {
  if(e.target.name==='pengajuan'){
    const kb=$('#kb'); if(kb)kb.hidden=e.target.value!=='kolaboratif';
    if(e.target.value==='kolaboratif'&&!document.querySelector('.peserta'))pesertaRow(true);
  }
  if(e.target.id==='o-periode'){
    const selectedPeriod=e.target.value;
    const parent=$('#o-parent');
    if(parent){
      const bems=(S.organizations||[]).filter(o=>o.tipe==='BEM' && (!selectedPeriod || String(o.periode_id)===String(selectedPeriod)));
      parent.innerHTML='<option value="">Pilih BEM</option>'+bems.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama)+'</option>').join('');
    }
  }

  if(e.target.id==='struktur-org'){
    S.structureOrgId=e.target.value||null;
    await Promise.all([loadStructure(),loadUnits(),loadJabatanAndUnits()]);
    return render();
  }

  if(e.target.id==='cx'){
    S.ctx=Number(e.target.value);
    S.orgId=S.ctxs[S.ctx]?.orgId||null;
    S.selectedProkerId=null;
    await loadPermissionsForOrganization(S.orgId);
    return render();
  }
  if(e.target.id==='an-peran'){
    syncSpecialAccountRole();
    return;
  }

  if(e.target.id==='an-org'){
    if($('#an-peran')?.value==='pembimbing'){
      syncSpecialAccountRole();
      return;
    }
  }

  if(['an-org','an-jabatan','p-org','p-jabatan'].includes(e.target.id)){
    const prefix=e.target.id.startsWith('p-')?'p':'an';
    if(prefix==='an' && ['pembimbing','wakil_rektor','staf_keuangan'].includes($('#an-peran')?.value)){
      syncSpecialAccountRole();
      return;
    }
    const orgEl=$('#'+prefix+'-org');
    const jabEl=$('#'+prefix+'-jabatan');
    const unitEl=$('#'+prefix+'-unit');
    const unitLabel=$('#'+prefix+'-unit-label');
    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl?.value||''));
    const positions=(S.positions||[]).filter(j=>!!org && Array.isArray(j.berlaku_tipe) && j.berlaku_tipe.includes(org.tipe));
    if(e.target.id.endsWith('-org') && jabEl){
      jabEl.innerHTML='<option value="">Pilih jabatan</option>'+positions.map(j=>'<option value="'+esc(j.kode)+'">'+esc(j.nama)+'</option>').join('');
      jabEl.value='';
    }
    const pos=(S.positions||[]).find(j=>j.kode===jabEl?.value);
    const relevantUnits=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'') && (!pos?.unit_jenis_wajib || u.jenis===pos.unit_jenis_wajib));

    if(unitLabel){
      if(!pos){
        unitLabel.textContent='Unit kerja';
      }else if(pos.unit_jenis_wajib){
        unitLabel.textContent=(pos.unit_jenis_wajib==='kementerian'?'Kementerian':'Divisi')+' '+(pos.unit_wajib?'(wajib)':'');
      }else{
        unitLabel.textContent='Unit kerja (tidak diperlukan untuk jabatan ini)';
      }
    }

    if(unitEl){
      if(!pos || !pos.unit_jenis_wajib){
        unitEl.innerHTML='<option value="">Tidak diperlukan untuk jabatan ini</option>';
        unitEl.disabled=true;
        unitEl.required=false;
      }else if(!relevantUnits.length){
        unitEl.innerHTML='<option value="">Belum ada '+(pos.unit_jenis_wajib==='kementerian'?'Kementerian':'Divisi')+'</option>';
        unitEl.disabled=true;
        unitEl.required=true;
      }else{
        unitEl.innerHTML='<option value="">Pilih '+(pos.unit_jenis_wajib==='kementerian'?'Kementerian':'Divisi')+'</option>'+relevantUnits.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nama)+'</option>').join('');
        unitEl.disabled=false;
        unitEl.required=!!pos.unit_wajib;
      }
    }
  }

  if(e.target.id==='o-tipe'){
    const type=e.target.value;
    const parent=$('#o-parent-wrap'), rel=$('#o-relasi-wrap');
    if(parent)parent.hidden=!(type==='HMJ'||type==='UKM');
    if(rel)rel.hidden=type!=='CLUB';
  }
  if(e.target.id==='csv-file'&&e.target.files[0])bacaCSV(e.target.files[0]);
  if(e.target.id==='profileAvatar')previewAvatar(e.target.files[0]);
});

document.addEventListener('click', e => {
  if(!e.target.closest('#notifWrap'))$('#notifPanel').hidden=true;
  if(!e.target.closest('#profileWrap'))$('#profileMenu').hidden=true;
});

document.addEventListener('submit', async e => {
  if(e.target.id==='fl'){
    e.preventDefault();
    const email=$('#em').value.trim().toLowerCase(), password=$('#pw').value;
    if(!email)return $('#le').textContent='Email wajib diisi.';
    if(!password)return $('#le').textContent='Kata sandi wajib diisi.';
    const submitBtn=e.target.querySelector('button[type="submit"], .btn.full');
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Memverifikasi...';}
    try{
      if(!sb)return $('#le').textContent='Login dinonaktifkan: Supabase belum dikonfigurasi.';
      const response=await fetch(SUPABASE_URL+'/functions/v1/'+SECURE_LOGIN_FUNCTION,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({email,password})});
      const payload=await response.json().catch(()=>({}));
      if(response.status===429){
        const retry=Number(payload.retry_after||response.headers.get('Retry-After')||900);
        return $('#le').textContent='Terlalu banyak percobaan. Coba lagi dalam '+Math.max(1,Math.ceil(retry/60))+' menit.';
      }
      if(!response.ok){
        $('#le').textContent=payload.error==='RATE_LIMIT_UNAVAILABLE'?'Sistem keamanan login sedang tidak tersedia. Coba lagi nanti.':'Email atau kata sandi salah.';
        return;
      }
      if(!payload.session?.access_token||!payload.session?.refresh_token)return $('#le').textContent='Sesi login tidak valid.';
      const {data,error}=await sb.auth.setSession({access_token:payload.session.access_token,refresh_token:payload.session.refresh_token});
      if(error||!data.session?.user)return $('#le').textContent='Gagal membuat sesi akun.';
      $('#le').textContent='';$('#pw').value='';
      await hydrateUser(data.session.user);
    }catch(error){console.error(error);$('#le').textContent='Login tidak dapat diproses. Periksa secure-login Edge Function.';}
    finally{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Masuk';}}
    return;
  }

  if(e.target.id==='ff'){
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target)), kolab=f.pengajuan==='kolaboratif', errors=[];
    const orgId=f.organisasi_id||S.orgId;
    if(!orgId)errors.push('Pilih organisasi terlebih dahulu.');
    if(!f.nama)errors.push('Nama program kerja wajib diisi.');
    if(!f.mulai||!f.selesai)errors.push('Tanggal mulai dan selesai wajib diisi.');
    if(f.selesai&&f.mulai&&f.selesai<f.mulai)errors.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if(!f.tempat)errors.push('Lokasi wajib diisi.');
    const pesertaRows=[...document.querySelectorAll('.peserta')];
    const validPeserta=pesertaRows.filter(row=>row.querySelector('select[data-org-id]')?.value);
    if(kolab&&!validPeserta.length)errors.push('Tambahkan minimal satu organisasi peserta.');
    if(kolab&&!hitung())errors.push('Total porsi peserta melebihi dana kampus proker.');
    if(errors.length){$('#fe').textContent=errors.join(' ');return;}
    const payload={organisasi_id:orgId,nama:f.nama,jenis:f.jenis,tanggal_mulai:f.mulai,tanggal_selesai:f.selesai,tempat:f.tempat,deskripsi:f.deskripsi||'',pengajuan:f.pengajuan,status:'direncanakan',ketua_pelaksana:S.user.nama,dibuat_oleh:S.user.id};
    const {data,error}=await sb.from('proker').insert(payload).select('id').single();
    if(error)return toast('Gagal menyimpan proker: '+error.message);
    if(kolab&&data?.id){
      const collabRows=[...document.querySelectorAll('.peserta')].map(row=>({
        proker_id:data.id,
        organisasi_id:row.querySelector('select[data-org-id]')?.value||null,
        porsi_plafon:Number(row.querySelector('input[type=number]')?.value||0),
        status:'diundang'
      })).filter(x=>x.organisasi_id);
      if(collabRows.length){
        const r=await sb.from('proker_kolaborator').insert(collabRows);
        if(r.error)toast('Proker tersimpan, tetapi kolaborator gagal disimpan: '+r.error.message);
      }
    }
    S.selectedProkerId=data.id;toast('Program kerja tersimpan.');return navigate('proker');
  }

  if(e.target.id==='form-akun'){
    e.preventDefault();
    if(S.user.peran!=='admin')return toast('Hanya administrator yang boleh membuat akun.');
    const input={nama:$('#an-nama').value.trim(),email:$('#an-email').value.trim().toLowerCase(),nim:$('#an-nim').value.trim(),peran:$('#an-peran').value,organisasi_id:$('#an-org').value||null,jabatan_kode:$('#an-jabatan').value||null,unit_id:$('#an-unit').value||null};
    try{
      const {data,error}=await sb.functions.invoke('admin-create-user',{body:input});
      if(error){
        let detail='';
        try{
          if(error.context && typeof error.context.json==='function'){
            const body=await error.context.json();
            detail=body?.detail||body?.error||'';
          }
        }catch(_){}
        return toast(detail||error.message||'Gagal membuat akun.');
      }
      if(!data?.ok)return toast(data?.error||'Gagal membuat akun.');
      S.revealedCredential={id:data.id,nama:input.nama,email:input.email,password:data.temporary_password};
      toast('Akun dibuat. Password sementara ditampilkan di panel akun.');
      e.target.reset();return render();
    }catch(error){return toast('Gagal membuat akun: '+error.message);}
  }

  if(e.target.id==='form-rapat'){
    e.preventDefault();
    const payload={dokumen_id:$('#r-dokumen').value.trim(),nomor:Number($('#r-nomor').value||0)||null,tanggal:$('#r-tanggal').value||null,peserta:$('#r-peserta').value.trim(),notulen:$('#r-notulen').value.trim(),hasil:$('#r-hasil').value};
    const {error}=await sb.from('rapat').insert(payload);
    if(error)return toast('Gagal menyimpan rapat: '+error.message);
    toast('Rapat tersimpan.');return render();
  }

  if(e.target.id==='form-plafon'){
    e.preventDefault();
    const organisasi_id=$('#p-org').value,jumlah=Number($('#p-jumlah').value||0);
    if(!organisasi_id||jumlah<0)return toast('Organisasi dan jumlah wajib valid.');
    const {error}=await sb.from('plafon_anggaran').upsert({organisasi_id,jumlah,diinput_oleh:S.user.id,diinput_pada:new Date().toISOString()});
    if(error)return toast('Gagal menyimpan plafon: '+error.message);
    toast('Plafon tersimpan.');return render();
  }

  if(e.target.id==='form-cair'){
    e.preventDefault();
    const proker_id=$('#c-proker').value,sumber_dana_id=$('#c-sumber').value,jumlah=Number($('#c-jumlah').value||0),tanggal=$('#c-tanggal').value||new Date().toISOString().slice(0,10),tahap=Number($('#c-tahap').value||1);
    if(!proker_id||!sumber_dana_id||jumlah<=0)return toast('Lengkapi proker, sumber dana, dan jumlah.');
    const {error}=await sb.from('pencairan_dana').insert({proker_id,sumber_dana_id,jumlah,tanggal,tahap,dicatat_oleh:S.user.id});
    if(error)return toast('Gagal mencatat pencairan: '+error.message);
    toast('Pencairan tersimpan.');return render();
  }

  if(e.target.id==='form-organisasi'){
    e.preventDefault();
    const nama=$('#o-nama').value.trim();
    const tipe=$('#o-tipe').value;
    const periode_id=$('#o-periode').value;
    const induk_organisasi_id=(tipe==='HMJ'||tipe==='UKM')?($('#o-parent').value||null):null;
    const relasi=[...($('#o-relasi')?.selectedOptions||[])].map(x=>x.value);
    if(!nama)return toast('Nama organisasi wajib diisi.');
    if(!periode_id)return toast('Pilih periode terlebih dahulu.');
    if((tipe==='HMJ'||tipe==='UKM')&&!induk_organisasi_id)return toast('Pilih BEM sebagai induk organisasi.');
    if(tipe==='BEM'&&induk_organisasi_id)return toast('BEM tidak boleh memiliki induk.');
    const {data,error}=await sb.from('organisasi').insert({nama,tipe,periode_id,induk_organisasi_id}).select('id').single();
    if(error)return toast('Gagal membuat organisasi: '+error.message);
    if(tipe==='CLUB'&&relasi.length){
      const rows=relasi.filter(id=>id!==data.id).map(id=>({organisasi_id:data.id,terhubung_dengan_id:id,hubungan:'terhubung',dibuat_oleh:S.user.id}));
      const r=await sb.from('organisasi_relasi').insert(rows);
      if(r.error)return toast('Organisasi dibuat, tetapi koneksi Club gagal: '+r.error.message);
    }
    toast('Organisasi berhasil ditambahkan.');return render();
  }

  if(e.target.id==='form-club-relasi'){
    e.preventDefault();
    if(!S.orgId)return toast('Pilih Club terlebih dahulu.');
    const target=$('#cr-org').value;
    if(!target)return toast('Pilih organisasi yang akan dihubungkan.');
    const {error}=await sb.from('organisasi_relasi').insert({
      organisasi_id:S.orgId,
      terhubung_dengan_id:target,
      hubungan:'terhubung',
      dibuat_oleh:S.user.id
    });
    if(error)return toast(error.code==='23505'?'Koneksi tersebut sudah ada.':'Gagal menambah koneksi: '+error.message);
    toast('Koneksi organisasi ditambahkan.');
    return render();
  }

  if(e.target.id==='form-unit'){
    e.preventDefault();
    const organisasi_id=['admin','wakil_rektor'].includes(S.user.peran) ? (S.structureOrgId||S.orgId) : S.orgId;
    const org=(S.organizations||[]).find(o=>o.id===organisasi_id);
    const jenis=org?.tipe==='BEM'?'kementerian':org?.tipe==='HMJ'?'divisi':null;
    const nama=$('#u-nama').value.trim();
    if(!organisasi_id||!nama)return toast('Pilih organisasi dan isi nama unit.');
    if(!jenis)return toast('Unit kerja hanya tersedia untuk BEM dan HMJ.');
    const {error}=await sb.from('unit_kerja').insert({organisasi_id,jenis,nama});
    if(error)return toast('Gagal membuat unit kerja: '+error.message);
    toast((jenis==='kementerian'?'Kementerian':'Divisi')+' berhasil dibuat.');
    await Promise.all([loadUnits(),loadJabatanAndUnits()]);
    return render();
  }


  if(e.target.id==='form-periode'){
    e.preventDefault();
    const nama=$('#pe-nama').value.trim();
    const status=$('#pe-status').value;
    const batas_lpj_hari=Number($('#pe-batas-hari').value||0);
    if(!nama)return toast('Nama periode wajib diisi.');
    if(!Number.isInteger(batas_lpj_hari)||batas_lpj_hari<1||batas_lpj_hari>365)return toast('Batas LPJ harus 1 sampai 365 hari.');
    const {error}=await sb.from('periode').insert({nama,status,batas_lpj_hari});
    if(error)return toast('Gagal membuat periode: '+error.message);
    toast('Periode tersimpan. Deadline LPJ akan dihitung otomatis saat proker mulai berjalan.');return render();
  }


  if(e.target.id==='form-penetapan'){
    e.preventDefault();
    const p_account_id=$('#p-akun').value;
    const p_organisasi_id=$('#p-org').value;
    const p_jabatan_kode=$('#p-jabatan').value;
    const p_unit_id=$('#p-unit').value||null;
    if(!p_account_id||!p_organisasi_id||!p_jabatan_kode)return toast('Akun, organisasi, dan jabatan wajib diisi.');
    const {error}=await sb.rpc('assign_organization_membership',{p_account_id,p_organisasi_id,p_jabatan_kode,p_unit_id});
    if(error)return toast('Gagal menambahkan penetapan: '+error.message);
    toast('Akun berhasil ditambahkan ke organisasi.');return render();
  }

  if(e.target.id==='form-club-member'){
    e.preventDefault();
    const nama=$('#cm-nama').value.trim(),nim=$('#cm-nim').value.trim();
    if(!S.orgId||!nama||!nim)return toast('Nama dan NIM wajib diisi.');
    const {error}=await sb.from('anggota_non_akun').insert({organisasi_id:S.orgId,nama,nim,dibuat_oleh:S.user.id});
    if(error)return toast('Gagal menambah anggota Club: '+error.message);
    toast('Anggota Club ditambahkan tanpa akun.');return render();
  }

  if(e.target.matches('form[data-koordinator-form]')){
    e.preventDefault();
    const ukmId=e.target.dataset.koordinatorForm;
    const accountId=e.target.querySelector('select[name="akun_id"]')?.value;
    if(!accountId)return toast('Pilih anggota BEM terlebih dahulu.');
    const {data,error}=await sb.functions.invoke('ukm-coordinator',{body:{action:'assign',ukm_id:ukmId,account_id:accountId}});
    if(error||!data?.ok)return toast('Gagal menunjuk koordinator: '+(data?.error||error?.message||'Terjadi kesalahan.'));
    toast('Koordinator UKM berhasil ditunjuk.');return render();
  }

  if(e.target.id==='form-profile')return saveProfile(e);

  if(e.target.matches('form[data-role-form]')){
    e.preventDefault();
    if(S.user.peran!=='admin')return toast('Hanya admin yang boleh mengubah hak akses jabatan.');
    const jabatanId=e.target.dataset.roleForm;
    const codes=[...e.target.querySelectorAll('input[name="perm"]:checked')].map(x=>x.value);
    const {error:deleteError}=await sb.from('hak_akses_jabatan').delete().eq('jabatan_id',jabatanId);
    if(deleteError)return toast('Gagal menghapus hak akses lama: '+deleteError.message);
    if(codes.length){
      const {error:insertError}=await sb.from('hak_akses_jabatan').insert(codes.map(kode=>({jabatan_id:jabatanId,kode})));
      if(insertError)return toast('Gagal menyimpan hak akses baru: '+insertError.message);
    }
    toast('Hak akses jabatan diperbarui.');
    return loadJabatanAndUnits().then(()=>render());
  }

  if(e.target.id==='form-ganti-pw'){
    e.preventDefault();
    const pw=$('#pw-baru').value;
    if(pw.length<10)return toast('Password minimal 10 karakter.');
    if(!/[A-Z]/.test(pw)||!/[a-z]/.test(pw)||!/[0-9]/.test(pw))return toast('Gunakan huruf besar, kecil, dan angka.');
    const {error}=await sb.auth.updateUser({password:pw});
    if(error)return toast(error.message);
    const done=await sb.functions.invoke('complete-password-change');
    if(done.error)return toast('Password berubah, tetapi status wajib ganti gagal diperbarui: '+done.error.message);
    S.user.wajib_ganti_sandi=false;
    navigate('beranda',false);toast('Password berhasil diperbarui.');
  }
});

initAuth();
