/* SIMA MHS: public config bindings, role permissions, and workflow-stage rules. */

// Public Supabase configuration. Login is fail-closed when configuration is missing.
const SUPABASE_URL = window.SIMA_CONFIG?.SUPABASE_URL || '';
const SUPABASE_KEY = window.SIMA_CONFIG?.SUPABASE_ANON_KEY || window.SIMA_CONFIG?.SUPABASE_PUBLISHABLE_KEY || '';
const SECURE_LOGIN_FUNCTION = 'secure-login';
const SUPABASE_PROJECT_REF = (()=>{try{return new URL(SUPABASE_URL).hostname.split('.')[0]||'';}catch(_){return '';}})();
const SUPABASE_STORAGE_URL = SUPABASE_PROJECT_REF ? 'https://'+SUPABASE_PROJECT_REF+'.storage.supabase.co' : '';
const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;
const UPLOAD_RETRY_DELAYS = [0,3000,5000,10000,20000];

// Auth is intentionally isolated per browser tab.
// Each tab gets its own storage key as well as its own sessionStorage, so
// Supabase Auth BroadcastChannel traffic cannot switch accounts between tabs.
const AUTH_STORAGE = window.sessionStorage;
const AUTH_TAB_ID = AUTH_STORAGE.getItem('sima.auth.tab.id') || crypto.randomUUID();
AUTH_STORAGE.setItem('sima.auth.tab.id', AUTH_TAB_ID);
const AUTH_STORAGE_KEY = 'sima.auth.tab.v3.' + AUTH_TAB_ID;

const sb = SUPABASE_URL && SUPABASE_KEY && window.supabase
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: AUTH_STORAGE_KEY,
        storage: AUTH_STORAGE
      }
    })
  : null;
const $ = s => document.querySelector(s), rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');

const ROLE_ACCESS = {
  user: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','profil']),
  admin: new Set(['periode','organisasi','unit_kerja','akun','jabatan','audit','profil']),
  pembimbing: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','inbox','rapat','profil']),
  staf_keuangan: new Set(['beranda','proker','undangan','galeri','laporan','struktur','plafon','cair','profil']),
  mahasiswa: new Set(['beranda','proker','form','undangan','galeri','laporan','struktur','profil']),
  kaprodi: new Set(['beranda','proker','galeri','laporan','struktur','inbox','profil']),
  dekan: new Set(['beranda','proker','galeri','laporan','struktur','inbox','profil']),
  wakil_rektor: new Set(['beranda','proker','undangan','galeri','laporan','struktur','inbox','plafon','profil'])
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
  anggota:null,
  struktur:'struktur.view',
  inbox:'dokumen.review',
  rapat:'rapat.manage',
  plafon:'keuangan.view',
  cair:null,
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
  'koordinator.view':'Lihat koordinasi BEM',
  'koordinator.manage':'Tunjuk Koordinator BEM',
  'club.member.view':'Lihat anggota UKM Minat Bakat',
  'club.member.manage':'Kelola anggota UKM Minat Bakat',
  'organisasi.relation.manage':'Kelola koneksi UKM Minat Bakat'
};

const ROLE_LABEL = {
  user:'User',
  admin:'Administrator',
  pembimbing:'Pembimbing',
  staf_keuangan:'Staf Keuangan',
  mahasiswa:'Mahasiswa',
  wakil_rektor:'Wakil Rektor 1',
  kaprodi:'Kepala Program Studi',
  dekan:'Dekan Fakultas'
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
  wakil_ketua:'Wakil Ketua',
  kaprodi:'Kepala Program Studi',
  dekan:'Dekan Fakultas'
};

function organizationTypeLabel(type){
  return type==='CLUB'?'UKM Minat Bakat':String(type||'Organisasi');
}
function isAcademicReviewerRole(role){return role==='kaprodi'||role==='dekan';}
function isReviewerAccountRole(role){return role==='pembimbing'||isAcademicReviewerRole(role);}

function positionLabel(code) {
  return POSITION_LABELS[code] || code || 'Anggota';
}

function syncSpecialAccountRole() {
  const roleEl=$('#an-peran'), orgEl=$('#an-org'), jabEl=$('#an-jabatan'), unitEl=$('#an-unit'), unitLabel=$('#an-unit-label');
  const nimEl=$('#an-nim'), nimLabel=$('#an-nim-label');
  if(!roleEl||!orgEl||!jabEl||!unitEl)return;
  const role=roleEl.value;
  const allOrgs=S.organizations||[];
  const bems=allOrgs.filter(o=>o.tipe==='BEM');
  const globalUnits=(S.units||[]).filter(u=>!u.organisasi_id);

  const setNimMode=(required,hidden=false)=>{
    if(nimLabel)nimLabel.hidden=hidden;
    if(nimEl){
      nimEl.required=required;
      nimEl.disabled=hidden;
      nimEl.hidden=hidden;
      if(hidden)nimEl.value='';
    }
  };

  const setOrgOptions=(items,placeholder='Pilih organisasi')=>{
    const current=orgEl.value;
    orgEl.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama)+' · '+esc(o.tipe)+'</option>').join('');
    if(items.some(o=>String(o.id)===String(current)))orgEl.value=current;
  };

  const setUnitOptions=(items,placeholder,disabled=true,required=false,selectedId=null)=>{
    unitEl.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nama)+'</option>').join('');
    unitEl.disabled=disabled;
    unitEl.required=required;
    if(selectedId && items.some(u=>String(u.id)===String(selectedId)))unitEl.value=selectedId;
  };

  // Only mahasiswa/user accounts require an NIM.
  setNimMode(['user','mahasiswa'].includes(role),false);

  if(role==='staf_keuangan'){
    setNimMode(false,true);
    orgEl.innerHTML='<option value="">Tidak ada organisasi</option>';
    orgEl.value='';
    orgEl.disabled=true;
    jabEl.innerHTML='<option value="">Tidak ada jabatan</option>';
    jabEl.value='';
    jabEl.disabled=true;
    unitLabel.textContent='Unit kerja';
    const tu=globalUnits.find(u=>u.jenis==='tata_usaha');
    setUnitOptions(tu?[tu]:[],'Tata Usaha',true,true,tu?.id||null);
    return;
  }

  if(role==='wakil_rektor'){
    setNimMode(false,true);
    setOrgOptions(bems,'BEM wajib');
    orgEl.disabled=true;
    if(bems.length)orgEl.value=bems[0].id;
    jabEl.innerHTML='<option value="">Wakil Rektor</option><option value="wakil_rektor">Wakil Rektor</option>';
    jabEl.value='wakil_rektor';
    jabEl.disabled=true;
    unitLabel.textContent='Unit kerja';
    const rektorat=globalUnits.find(u=>u.jenis==='rektorat');
    setUnitOptions(rektorat?[rektorat]:[],'Rektorat',true,true,rektorat?.id||null);
    return;
  }

  if(role==='dekan'){
    setNimMode(false,true);
    orgEl.innerHTML='<option value="">Seluruh program studi</option>';
    orgEl.value='';
    orgEl.disabled=true;
    jabEl.innerHTML='<option value="dekan">Dekan Fakultas · cakupan seluruh program studi</option>';
    jabEl.value='dekan';
    jabEl.disabled=true;
    unitLabel.textContent='Cakupan kewenangan';
    setUnitOptions([],'Semua program studi di fakultas',true,false);
    return;
  }

  orgEl.disabled=false;
  jabEl.disabled=false;

  if(role==='pembimbing'){
    setNimMode(false,true);

    const hmjs=allOrgs.filter(o=>o.tipe==='HMJ');
    const currentOrg=orgEl.value;
    setOrgOptions(hmjs,'Pilih HMJ yang dibimbing');
    if(hmjs.some(o=>String(o.id)===String(currentOrg)))orgEl.value=currentOrg;

    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
    jabEl.innerHTML=org
      ? '<option value="pembimbing_hmj">Pembimbing HMJ</option>'
      : '<option value="">Pilih HMJ terlebih dahulu</option>';
    jabEl.value=org?'pembimbing_hmj':'';
    jabEl.disabled=true;

    unitLabel.textContent='Program studi / unit kerja (otomatis)';
    const programUnits=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'') && u.jenis==='program_studi');
    if(programUnits.length===1){
      setUnitOptions(programUnits,'Unit otomatis',true,true,programUnits[0].id);
    }else if(programUnits.length>1){
      setUnitOptions(programUnits,'Unit program studi belum unik',true,true);
    }else{
      setUnitOptions([],'Program studi HMJ belum tersedia',true,true);
    }
    return;
  }

  if(isAcademicReviewerRole(role)){
    setNimMode(false,true);
    const hmjs=allOrgs.filter(o=>o.tipe==='HMJ');
    const selectedOrg=orgEl.value;
    setOrgOptions(hmjs,'Pilih HMJ yang menjadi cakupan reviewer');
    if(hmjs.some(o=>String(o.id)===String(selectedOrg)))orgEl.value=selectedOrg;
    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
    jabEl.innerHTML=org
      ? '<option value="'+role+'">'+(role==='kaprodi'?'Kepala Program Studi':'Dekan Fakultas')+'</option>'
      : '<option value="">Pilih HMJ terlebih dahulu</option>';
    jabEl.value=org?role:'';
    jabEl.disabled=true;
    if(role==='kaprodi'){
      unitLabel.textContent='Program studi yang menjadi cakupan Kaprodi';
      const programUnits=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'')&&u.jenis==='program_studi');
      if(programUnits.length===1)setUnitOptions(programUnits,'Program studi',true,true,programUnits[0].id);
      else if(programUnits.length>1)setUnitOptions(programUnits,'Pilih program studi',false,true);
      else setUnitOptions([],'Program studi HMJ belum tersedia',true,true);
    }else{
      unitLabel.textContent='Unit kerja (tidak wajib untuk Dekan)';
      setUnitOptions([],'Tidak memerlukan unit khusus',true,false);
    }
    return;
  }

  setNimMode(['user','mahasiswa'].includes(role),false);

  const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
  const positions=(S.positions||[]).filter(j=>Array.isArray(j.berlaku_tipe) && j.berlaku_tipe.includes(org?.tipe));
  jabEl.innerHTML='<option value="">'+(orgEl.value?'Pilih jabatan':'Pilih organisasi dulu')+'</option>'+positions.map(j=>'<option value="'+esc(j.kode)+'">'+esc(j.nama)+'</option>').join('');
  jabEl.value='';
  unitEl.innerHTML='<option value="">Pilih jabatan terlebih dahulu</option>';
  unitEl.disabled=true;
  unitEl.required=false;
  unitLabel.textContent='Unit kerja';
}

function syncAdditionalAssignment() {
  const accountEl=$('#p-akun'), orgEl=$('#p-org'), jabEl=$('#p-jabatan'), unitEl=$('#p-unit'), unitLabel=$('#p-unit-label');
  if(!accountEl||!orgEl||!jabEl||!unitEl)return;

  const account=(S.accounts||[]).find(x=>String(x.id)===String(accountEl.value||''));
  const role=account?.peran||'';
  const allOrgs=S.organizations||[];
  orgEl.disabled=false;
  orgEl.required=true;
  jabEl.required=true;

  const setOrgOptions=(items,placeholder)=>{
    const current=orgEl.value;
    orgEl.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama)+' · '+esc(o.tipe)+'</option>').join('');
    if(items.some(o=>String(o.id)===String(current)))orgEl.value=current;
  };

  if(role==='dekan'){
    orgEl.innerHTML='<option value="">Cakupan global · seluruh program studi</option>';
    orgEl.value='';
    orgEl.disabled=true;
    orgEl.required=false;
    jabEl.innerHTML='<option value="">Tidak perlu penetapan organisasi</option>';
    jabEl.value='';
    jabEl.disabled=true;
    jabEl.required=false;
    unitLabel.textContent='Cakupan';
    unitEl.innerHTML='<option value="">Semua program studi pada fakultas</option>';
    unitEl.value='';
    unitEl.disabled=true;
    unitEl.required=false;
    return;
  }

  if(role==='pembimbing'){
    const hmjs=allOrgs.filter(o=>o.tipe==='HMJ');
    setOrgOptions(hmjs,'Pilih HMJ yang dibimbing');

    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
    jabEl.innerHTML=org
      ? '<option value="pembimbing_hmj">Pembimbing HMJ</option>'
      : '<option value="">Pilih HMJ terlebih dahulu</option>';
    jabEl.value=org?'pembimbing_hmj':'';
    jabEl.disabled=true;

    const programUnits=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'') && u.jenis==='program_studi');
    unitLabel.textContent='Program studi / unit kerja (otomatis)';
    if(programUnits.length===1){
      unitEl.innerHTML='<option value="'+esc(programUnits[0].id)+'">'+esc(programUnits[0].nama)+'</option>';
      unitEl.value=programUnits[0].id;
      unitEl.disabled=true;
      unitEl.required=true;
    }else{
      unitEl.innerHTML='<option value="">'+(programUnits.length?'Unit program studi belum unik':'Program studi HMJ belum tersedia')+'</option>';
      unitEl.value='';
      unitEl.disabled=true;
      unitEl.required=true;
    }
    return;
  }

  if(isAcademicReviewerRole(role)){
    const hmjs=allOrgs.filter(o=>o.tipe==='HMJ');
    setOrgOptions(hmjs,'Pilih HMJ yang menjadi cakupan reviewer');
    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
    jabEl.disabled=true;
    jabEl.innerHTML=org
      ? '<option value="'+role+'">'+(role==='kaprodi'?'Kepala Program Studi':'Dekan Fakultas')+'</option>'
      : '<option value="">Pilih HMJ terlebih dahulu</option>';
    jabEl.value=org?role:'';
    if(role==='kaprodi'){
      const programUnits=(S.units||[]).filter(u=>String(u.organisasi_id)===String(org?.id||'')&&u.jenis==='program_studi');
      unitLabel.textContent='Program studi';
      unitEl.innerHTML='<option value="">'+(programUnits.length?'Pilih program studi':'Program studi HMJ belum tersedia')+'</option>'+programUnits.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.nama)+'</option>').join('');
      unitEl.disabled=programUnits.length===0;unitEl.required=true;
      if(programUnits.length===1)unitEl.value=programUnits[0].id;
    }else{
      unitLabel.textContent='Unit kerja (tidak wajib untuk Dekan)';
      unitEl.innerHTML='<option value="">Tidak memerlukan unit khusus</option>';
      unitEl.value='';unitEl.disabled=true;unitEl.required=false;
    }
    return;
  }

  // Other accounts use the normal organization/position/unit flow.
  const org=(S.organizations||[]).find(o=>String(o.id)===String(orgEl.value||''));
  const positions=(S.positions||[]).filter(j=>!!org && Array.isArray(j.berlaku_tipe) && j.berlaku_tipe.includes(org.tipe));
  jabEl.disabled=false;
  jabEl.innerHTML='<option value="">'+(org?'Pilih jabatan':'Pilih organisasi dulu')+'</option>'+positions.map(j=>'<option value="'+esc(j.kode)+'">'+esc(j.nama)+'</option>').join('');
  jabEl.value='';
  unitEl.innerHTML='<option value="">Pilih jabatan terlebih dahulu</option>';
  unitEl.disabled=true;
  unitEl.required=false;
  unitLabel.textContent='Unit kerja';
}



function isBphBemBudgetViewer() {
  const bphCodes = new Set(['presiden','wakil_presiden','sekretaris','bendahara']);
  return (S.memberships || []).some(m => {
    if (m.status !== 'aktif' || !m.jabatan_id) return false;
    const org = (S.organizations || []).find(o => String(o.id) === String(m.organisasi_id));
    const position = (S.positions || []).find(j => String(j.id) === String(m.jabatan_id));
    return org?.tipe === 'BEM' && position?.aktif === true && bphCodes.has(position.kode);
  });
}

function isBphFundUsageViewer(orgId=S.orgId) {
  if (!orgId) return false;
  const org = (S.organizations || []).find(o => String(o.id) === String(orgId));
  if (!['BEM','HMJ'].includes(org?.tipe)) return false;
  const allowedCodes = org.tipe === 'BEM'
    ? new Set(['presiden','wakil_presiden','bendahara','sekretaris'])
    : new Set(['ketua','wakil_ketua','bendahara','sekretaris']);
  return (S.memberships || []).some(m => {
    if (String(m.organisasi_id) !== String(orgId) || m.status !== 'aktif' || !m.jabatan_id) return false;
    const position = (S.positions || []).find(j => String(j.id) === String(m.jabatan_id));
    return position?.aktif === true && allowedCodes.has(position.kode);
  });
}

function canAccessView(view) {
  const role = S.user?.peran || '';

  if (view === 'ganti_sandi' || view === 'profil') return true;
  if (role === 'admin') return ADMIN_VIEWS.has(view);
  if (ADMIN_VIEWS.has(view)) return false;

  if (view === 'anggota') {
    return role === 'pembimbing' || role === 'wakil_rektor';
  }

  // Wakil Rektor is a campus-wide observer with review authority only for BEM.
  // The actual approve/revise authorization is enforced server-side.
  if (role === 'wakil_rektor') {
    return new Set(['beranda','proker','review','undangan','galeri','laporan','struktur','inbox','plafon','profil']).has(view);
  }

  if (view === 'plafon' && isBphBemBudgetViewer()) return true;
  if (view === 'cair' && isBphFundUsageViewer()) return true;

  const permission = VIEW_PERMISSION[view];
  if (permission && S.permissions?.has(permission)) return true;

  if (S.positionsLoaded) return false;
  return ROLE_ACCESS[role]?.has(view) === true;
}

function roleLabel(role) {
  return ROLE_LABEL[role] || 'Peran tidak dikenal';
}

const NEW_COORDINATOR_STAGES=new Set(['koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj','koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi']);
const NEW_PRESIDENT_STAGES=new Set(['presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj']);
const NEW_KAPRODI_STAGES=new Set(['kaprodi_hmj','kaprodi_hmj_lpj']);
const NEW_DEKAN_STAGES=new Set(['dekan_hmj','dekan_hmj_lpj']);
const NEW_HMJ_FORWARD_STAGES=new Set(['hmj_lanjut_kaprodi','hmj_lanjut_dekan','hmj_lanjut_wakil_rektor','hmj_lanjut_kaprodi_lpj','hmj_lanjut_dekan_lpj','hmj_lanjut_wakil_rektor_lpj']);
const NEW_WR_STAGES=new Set(['wakil_rektor','wakil_rektor_lpj','wakil_rektor_ukm','wakil_rektor_hmj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj']);
function reviewStageLabel(stage, organizationType=null){
 const labels={
  pembimbing_hmj:'Pembimbing HMJ',bem:'BEM',wakil_rektor:'Wakil Rektor 1',bem_lpj:'BEM · review LPJ',wakil_rektor_lpj:'Wakil Rektor 1 · review LPJ',
  ukm_koordinator:'Koordinator BEM · proposal UKM',ukm_presiden_bem:'Presiden BEM · proposal UKM',ukm_koordinator_lpj:'Koordinator BEM · LPJ UKM',ukm_presiden_bem_lpj:'Presiden BEM · LPJ UKM',
  koordinator_hmj:'Koordinator BEM · proposal HMJ',koordinator_ukm:'Koordinator BEM · proposal UKM',
  koordinator_hmj_lpj:'Koordinator BEM · LPJ HMJ',koordinator_ukm_lpj:'Koordinator BEM · LPJ UKM',
  koordinator_hmj_revisi:'Koordinator BEM · revisi HMJ',koordinator_ukm_revisi:'Koordinator BEM · revisi UKM',
  koordinator_hmj_lpj_revisi:'Koordinator BEM · revisi LPJ HMJ',koordinator_ukm_lpj_revisi:'Koordinator BEM · revisi LPJ UKM',
  presiden_bem_hmj:'Presiden BEM · proposal HMJ',presiden_bem_ukm:'Presiden BEM · proposal UKM',
  presiden_bem_hmj_lpj:'Presiden BEM · LPJ HMJ',presiden_bem_ukm_lpj:'Presiden BEM · LPJ UKM',
  hmj_lanjut_kaprodi:'HMJ · ajukan ke Kaprodi',kaprodi_hmj:'Kaprodi · proposal HMJ',
  hmj_lanjut_dekan:'HMJ · ajukan ke Dekan Fakultas',dekan_hmj:'Dekan Fakultas · review HMJ',
  hmj_lanjut_wakil_rektor:'HMJ · ajukan ke Wakil Rektor 1',wakil_rektor_hmj:'Wakil Rektor 1 · proposal HMJ',
  wakil_rektor_ukm:'Wakil Rektor 1 · proposal UKM',hmj_lanjut_kaprodi_lpj:'HMJ · LPJ ke Kaprodi',
  kaprodi_hmj_lpj:'Kaprodi · LPJ HMJ',hmj_lanjut_dekan_lpj:'HMJ · LPJ ke Dekan Fakultas',dekan_hmj_lpj:'Dekan Fakultas · review LPJ HMJ',
  hmj_lanjut_wakil_rektor_lpj:'HMJ · LPJ ke Wakil Rektor 1',wakil_rektor_hmj_lpj:'Wakil Rektor 1 · LPJ HMJ',wakil_rektor_ukm_lpj:'Wakil Rektor 1 · LPJ UKM'
 };
 const label=labels[stage]||'';
 return organizationType==='CLUB'?label.replace(/UKM/g,'UKM Minat Bakat'):label;
}
function isUkmProker(p){return ['UKM','CLUB'].includes(p?.organisasi?.tipe);}
function isHmjProker(p){return p?.organisasi?.tipe==='HMJ';}
function isBemProker(p){return p?.organisasi?.tipe==='BEM';}
function isNewWorkflowCoordinator(p){
 return !!p&&NEW_COORDINATOR_STAGES.has(p.review_stage)&&(S.coordinatorAssignments||[]).some(x=>String(x.organisasi_id)===String(p.organisasi_id)&&String(x.akun_id)===String(S.user.id)&&x.status==='aktif'&&(x.mulai_pada==null||x.mulai_pada<=new Date().toISOString().slice(0,10))&&(x.berakhir_pada==null||x.berakhir_pada>=new Date().toISOString().slice(0,10)));
}
function isNewWorkflowPresident(p){
 if(!p||!NEW_PRESIDENT_STAGES.has(p.review_stage))return false;
 const parentId=p.organisasi?.induk_organisasi_id;
 return !!parentId&&(S.memberships||[]).some(m=>String(m.organisasi_id)===String(parentId)&&String(m.akun_id)===String(S.user.id)&&m.status==='aktif'&&m.jabatan_id&&(S.positions||[]).find(j=>String(j.id)===String(m.jabatan_id))?.kode==='presiden');
}
function isNewWorkflowKaprodi(p){
 if(S.user.peran!=='kaprodi'||!p||!NEW_KAPRODI_STAGES.has(p.review_stage)||!isHmjProker(p))return false;
 const profileUnitId=String(S.user.unit_kerja_id||'');
 if(!profileUnitId)return false;
 return (S.memberships||[]).some(m=>
   String(m.organisasi_id)===String(p.organisasi_id)&&
   String(m.akun_id)===String(S.user.id)&&
   m.status==='aktif'&&
   String(m.unit_id||'')===profileUnitId&&
   !!m.jabatan_id&&
   (S.positions||[]).find(j=>String(j.id)===String(m.jabatan_id))?.kode==='kaprodi'
 );
}
function isNewWorkflowDekan(p){
 return S.user.peran==='dekan'&&!!p&&NEW_DEKAN_STAGES.has(p.review_stage)&&isHmjProker(p);
}
function isNewWorkflowWR(p){return S.user.peran==='wakil_rektor'&&!!p&&NEW_WR_STAGES.has(p.review_stage);}
function isNewWorkflowReviewer(p){return isNewWorkflowCoordinator(p)||isNewWorkflowPresident(p)||isNewWorkflowKaprodi(p)||isNewWorkflowDekan(p)||isNewWorkflowWR(p);}
function isNewWorkflowOwnerForwardStage(p){return !!p&&!p.__ukmBphReadOnly&&!p.__collaborator&&String(S.orgId||'')===String(p.organisasi_id||'')&&NEW_HMJ_FORWARD_STAGES.has(p.review_stage)&&isHmjProker(p)&&(S.permissions?.has('proker.create')||S.permissions?.has('proker.edit'));}
function isUkmCoordinatorReviewer(p){return !!p&&['ukm_koordinator','ukm_koordinator_lpj'].includes(p.review_stage)&&(S.coordinatorAssignments||[]).some(x=>String(x.organisasi_id)===String(p.organisasi_id)&&String(x.akun_id)===String(S.user.id)&&x.status==='aktif');}
function isUkmPresidentReviewer(p){
 if(!p||!['ukm_presiden_bem','ukm_presiden_bem_lpj'].includes(p.review_stage))return false;
 const parentId=p.organisasi?.induk_organisasi_id;
 return !!parentId&&(S.memberships||[]).some(m=>String(m.organisasi_id)===String(parentId)&&String(m.akun_id)===String(S.user.id)&&m.status==='aktif'&&m.jabatan_id&&(S.positions||[]).find(j=>String(j.id)===String(m.jabatan_id))?.kode==='presiden');
}
function isUkmStageReviewer(p){return isNewWorkflowReviewer(p)||isUkmCoordinatorReviewer(p)||isUkmPresidentReviewer(p);}
async function transitionWorkflow(p,action,comment=null,approvedBudget=null){
 if(!sb)throw new Error('Supabase belum tersedia.');
 if(!p?.id)throw new Error('Proker tidak ditemukan.');
 const stage=String(p.review_stage||'');
 const legacyActions=new Set(['forward_hmj_to_bem','forward_lpj_to_bem','resubmit_hmj_consult','resubmit_hmj_skip']);
 const legacyStages=new Set(['pembimbing_hmj','pembimbing_hmj_lpj','bem','bem_lpj','bem_from_wakil_rektor','hmj_from_bem','hmj_from_pembimbing','hmj_from_pembimbing_approved','hmj_from_pembimbing_lpj','hmj_from_pembimbing_lpj_revision','hmj_from_bem_lpj','hmj_from_wakil_rektor_lpj','ukm_koordinator','ukm_presiden_bem','ukm_koordinator_lpj','ukm_presiden_bem_lpj']);
 const useLegacy=legacyActions.has(action)||(legacyStages.has(stage)&&!['submit','resubmit','submit_lpj'].includes(action));
 return sb.rpc(useLegacy?'transition_proker':'transition_proker_v2',{p_proker_id:p.id,p_action:action,p_comment:comment,p_anggaran_disetujui:approvedBudget});
}


const ST = { direncanakan:['Direncanakan',''], draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Perlu revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Sedang berjalan','ok'], selesai:['Kegiatan selesai','bl'], lpj_diajukan:['LPJ menunggu review','wa'], lpj_disetujui:['LPJ disetujui','ok'], tidak_terlaksana:['Tidak terlaksana','er'], arsip:['Diarsipkan',''], digabung:['Digabung',''] };
