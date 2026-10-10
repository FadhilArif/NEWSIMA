/* SIMA MHS: shared application state, utility functions, and account context loading. */

// State Global
const S = {
  user:{nama:'',email:'',nim:'',avatar_url:'',wajib_ganti_sandi:false},
  authLost:false,
  ctx:0,ctxs:[],view:'beranda',tab:'semua',q:'',orgId:null,
  history:[],notifications:[],memberships:[],organizations:[],positions:[],permissions:new Set(),positionsLoaded:false,structureOrgId:null,organizationRelations:[],coordinatorAssignments:[],clubMembers:[],revealedCredential:null,storageStatus:null,pendingAvatarFile:null,
  selectedProkerId:null,detail:null,reviewDocId:null,
  undangan:[],inbox:[],gallery:[],reports:[],structure:[],meetings:[],budgets:[],approvedCampusProkers:[],payouts:[],periods:[],audit:[],accounts:[],sources:[],units:[],anggota:[],anggotaPeriodId:null,anggotaQ:'',
  proker:[],fundUsageProkers:[],csvData:[],lastCredentials:[],permissionMatrix:{},tempSb:null,notificationChannel:null,renderToken:0,searchTimer:null,
  contextSwitchTimer:null,contextSwitchSeq:0,authRecoveryPromise:null,
  uploadLockPromise:null,lastKnownSession:null,intentionalSignOut:false,authRecoveryTimer:null,
  activityThumbUrlCache:new Map(),coordinatorAssignmentsLoadedAt:0,coordinatorAssignmentsCacheKey:'',
  notificationsLoadedAt:0,notificationsLoadPromise:null,hydrateUserPromise:null,
  dekanDirectory:[],dekanDirectoryLoadedAt:0,dekanDirectoryPromise:null,dekanDirectoryError:'',dekanDirectoryHmjId:'',dekanDirectoryHmjQ:'',dekanDirectoryMemberQ:''
}

const MENU = [
  ['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['anggota','Lihat anggota'],['struktur','Struktur dan anggota'],['koordinator','Koordinator BEM']]],
  ['Review',[['inbox','Inbox review'],['rapat','Rapat']]], 
  ['Anggaran',[['plafon','Plafon dan anggaran'],['cair','Penggunaan Dana']]],
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

  // Dekan is a global application role and does not need organization memberships.
  // Keep the position catalog for labels/history, but avoid an unnecessary membership query.
  const membershipQuery=S.user.peran==='dekan'
    ? Promise.resolve({data:[],error:null})
    : sb.from('keanggotaan')
        .select('id,akun_id,organisasi_id,unit_id,jabatan_id,jabatan,status')
        .eq('akun_id', S.user.id)
        .eq('status','aktif');
  const [mRes,pRes] = await Promise.all([
    membershipQuery,
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
  if (S.user.peran==='dekan') {
    S.permissions = new Set(['beranda.view','proker.view','struktur.view','dokumen.review','laporan.review']);
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
  } else if (S.user.peran==='dekan') {
    S.ctxs = [{
      orgId:null,
      org:'Seluruh program studi',
      peran:'Dekan Fakultas',
      roleCode:'dekan',
      global:true,
      permissionAll:false
    }];
    S.permissions = new Set(['beranda.view','proker.view','struktur.view','dokumen.review','laporan.review']);
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

