/* SIMA MHS: organization/admin data loaders and per-view caches. */

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

async function loadDekanDirectory({force=false}={}) {
  if(!sb||S.user?.peran!=='dekan')return;
  if(!force&&S.dekanDirectoryLoadedAt&&Date.now()-S.dekanDirectoryLoadedAt<60000)return;
  if(!force&&S.dekanDirectoryPromise)return S.dekanDirectoryPromise;
  const request=(async()=>{
    const {data,error}=await sb.rpc('get_dekan_hmj_directory');
    if(error){S.dekanDirectoryError=error.message||'Tidak dapat memuat direktori HMJ.';console.warn('Gagal memuat direktori HMJ Dekan:',error);return;}
    S.dekanDirectory=Array.isArray(data)?data:[];
    S.dekanDirectoryError='';
    S.dekanDirectoryLoadedAt=Date.now();
  })();
  S.dekanDirectoryPromise=request;
  try{return await request;}finally{if(S.dekanDirectoryPromise===request)S.dekanDirectoryPromise=null;}
}
function dekanDirectoryRowsHtml(){
  if(S.dekanDirectoryError)return '<div class="card border border-red-200 bg-red-50"><h3 class="!text-red-900">Direktori HMJ gagal dimuat</h3><p class="text-sm text-red-800">'+esc(S.dekanDirectoryError)+'</p><button type="button" class="btn mt-3" data-dekan-directory-refresh>Muat ulang</button></div>';
  if(!S.dekanDirectory.length)return emptyCard('Belum ada data HMJ yang bisa ditampilkan.');
  const hmjOptions=new Map();
  S.dekanDirectory.forEach(row=>{if(!hmjOptions.has(row.hmj_id))hmjOptions.set(row.hmj_id,{nama:row.hmj_nama,jumlah:0});if(row.akun_id)hmjOptions.get(row.hmj_id).jumlah++;});
  const hmjQuery=String(S.dekanDirectoryHmjQ||'').trim().toLocaleLowerCase('id-ID');
  const memberQuery=String(S.dekanDirectoryMemberQ||'').trim().toLocaleLowerCase('id-ID');
  const filtered=S.dekanDirectory.filter(row=>{
    if(S.dekanDirectoryHmjId&&String(row.hmj_id)!==String(S.dekanDirectoryHmjId))return false;
    if(hmjQuery&&!String(row.hmj_nama||'').toLocaleLowerCase('id-ID').includes(hmjQuery))return false;
    if(memberQuery){const name=String(row.nama_anggota||'').toLocaleLowerCase('id-ID'),nim=String(row.nim||'').toLocaleLowerCase('id-ID');if(!row.akun_id||(!name.includes(memberQuery)&&!nim.includes(memberQuery)))return false;}
    return true;
  });
  const memberCount=filtered.filter(row=>row.akun_id).length;
  const visibleHmj=new Set(filtered.map(row=>row.hmj_id));
  return '<div class="card mb-3"><div class="flex flex-wrap items-center justify-between gap-3"><p class="sub mb-0"><b>'+memberCount+'</b> anggota · <b>'+visibleHmj.size+'</b> HMJ sesuai filter</p><button type="button" class="btn s" data-dekan-directory-reset>Reset filter</button></div></div>'+
    (filtered.length
      ? '<div class="card overflow-x-auto"><table><thead><tr><th>HMJ</th><th>Nama anggota</th><th>NIM</th><th>Jabatan</th><th>Unit / program studi</th></tr></thead><tbody>'+
        filtered.map(row=>'<tr><td><b>'+esc(row.hmj_nama||'-')+'</b></td><td>'+(row.akun_id?'<b>'+esc(row.nama_anggota||'-')+'</b>':'<span class="text-slate-400">Belum ada anggota aktif</span>')+'</td><td>'+esc(row.nim||'-')+'</td><td>'+esc(row.jabatan||'-')+'</td><td>'+esc(row.unit_kerja||'-')+'</td></tr>').join('')+
        '</tbody></table></div>'
      : emptyCard('Tidak ada HMJ atau anggota yang sesuai dengan filter.'));
}
function refreshDekanDirectoryResults(){const container=document.querySelector('#dekan-directory-results');if(container)container.innerHTML=dekanDirectoryRowsHtml();}

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
  S.approvedCampusProkers=[];
  if(!sb)return;

  const canSeeCampusBudget =
    ['admin','wakil_rektor','staf_keuangan'].includes(S.user.peran) ||
    isBphBemBudgetViewer();
  if(!canSeeCampusBudget){
    return;
  }

  const {data:periodRows,error:periodError}=await sb.from('periode')
    .select('id,nama,status,batas_lpj_hari')
    .order('nama');
  if(periodError)return toast('Gagal memuat periode: '+periodError.message);
  S.periods=periodRows||[];
  const activePeriod=S.periods.find(x=>x.status==='aktif');
  if(!activePeriod?.id)return;

  const [budgetResult,statusResult,campusProkerResult]=await Promise.all([
    sb.from('anggaran_periode').select('id,periode_id,plafon,diatur_oleh,diatur_pada').eq('periode_id',activePeriod.id).maybeSingle(),
    sb.rpc('get_anggaran_periode_status',{p_periode_id:activePeriod.id}),
    sb.rpc('get_anggaran_periode_proposals',{p_periode_id:activePeriod.id})
  ]);
  if(budgetResult.error){
    toast('Gagal memuat plafon periode: '+budgetResult.error.message);
    return;
  }
  if(statusResult.error){
    toast('Gagal menghitung penggunaan plafon: '+statusResult.error.message);
    return;
  }

  const budget=budgetResult.data;
  const statusData=statusResult.data;
  const status=Array.isArray(statusData)?(statusData[0]||null):(statusData||null);
  if(campusProkerResult.error){
    console.error('Gagal memuat proposal pengguna plafon:',campusProkerResult.error);
    S.approvedCampusProkers=[];
  }else{
    S.approvedCampusProkers=Array.isArray(campusProkerResult.data)?campusProkerResult.data:[];
  }

  S.budgets=budget?[{
    ...budget,
    periode:activePeriod,
    ...(status||{})
  }]:[{
    periode_id:activePeriod.id,
    plafon:0,
    digunakan:0,
    tersisa:0,
    persentase:0,
    periode:activePeriod
  }];
}

async function loadFundUsage() {
  S.payouts=[];
  S.fundUsageProkers=[];
  if(!sb || !isBphFundUsageViewer()) return;

  const orgId=S.orgId;
  const {data:prokers,error:prokerError}=await sb.from('proker')
    .select('id,nama,anggaran_disetujui,anggaran_disetujui_pada,status')
    .eq('organisasi_id',orgId)
    .eq('sumber_dana_kode','KAMPUS')
    .gt('anggaran_disetujui',0)
    .order('anggaran_disetujui_pada',{ascending:false});
  if(prokerError)return toast('Gagal memuat anggaran organisasi: '+prokerError.message);

  const ids=(prokers||[]).map(x=>x.id);
  if(!ids.length)return;

  const {data:usage,error:usageError}=await sb.from('penggunaan_dana')
    .select('id,proker_id,jumlah,tanggal,keterangan,dicatat_oleh,dibuat_pada')
    .in('proker_id',ids)
    .order('tanggal',{ascending:false});
  if(usageError)return toast('Gagal memuat penggunaan dana: '+usageError.message);

  const usedBy=Object.fromEntries(ids.map(id=>[id,0]));
  (usage||[]).forEach(x=>{usedBy[x.proker_id]=(usedBy[x.proker_id]||0)+Number(x.jumlah||0);});
  S.payouts=(usage||[]).map(x=>({...x,proker:(prokers||[]).find(p=>p.id===x.proker_id)||null}));

  S.fundUsageProkers=(prokers||[]).map(p=>({
    ...p,
    digunakan:usedBy[p.id]||0,
    tersisa:Math.max(Number(p.anggaran_disetujui||0)-(usedBy[p.id]||0),0)
  }));
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
  // Admin account creation may target any HMJ; keep all units in memory for reviewer-role
  // assignment. Structure views still filter this list by their selected organization.
  const targetOrgId=S.user.peran==='admin' ? null : S.user.peran==='wakil_rektor' ? (S.structureOrgId||S.orgId) : S.orgId;
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

async function loadCoordinatorAssignments({force=false}={}) {
  if(!sb)return;
  const cacheKey=String(S.user?.id||'')+'|'+String(S.orgId||'global');
  if(!force && S.coordinatorAssignmentsCacheKey===cacheKey
    && Date.now()-Number(S.coordinatorAssignmentsLoadedAt||0)<30000)return;
  S.coordinatorAssignments=[];

  const fields='id,organisasi_id,akun_id,status,ditunjuk_oleh,ditunjuk_pada,mulai_pada,berakhir_pada';
  const current=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
  let managedOrganizationIds=[];
  if(['HMJ','UKM','CLUB'].includes(current?.tipe)){
    managedOrganizationIds=[current.id];
  }else if(current?.tipe==='BEM'){
    managedOrganizationIds=(S.organizations||[])
      .filter(o=>['HMJ','UKM','CLUB'].includes(o.tipe)&&String(o.induk_organisasi_id||'')===String(current.id))
      .map(o=>o.id);
  }

  // A coordinator may be assigned from a BEM ministry or other context;
  // always fetch assignments directly addressed to the signed-in account.
  const ownQuery=S.user?.id
    ? sb.from('penugasan_koordinator').select(fields)
        .eq('akun_id',S.user.id).eq('status','aktif')
    : Promise.resolve({data:[],error:null});

  let managedQuery=null;
  if(managedOrganizationIds.length){
    managedQuery=sb.from('penugasan_koordinator').select(fields)
      .eq('status','aktif').in('organisasi_id',managedOrganizationIds);
  }else if(!S.orgId && ['admin','wakil_rektor'].includes(S.user?.peran||'')){
    managedQuery=sb.from('penugasan_koordinator').select(fields).eq('status','aktif');
  }

  const [ownRes,managedRes]=await Promise.all([
    ownQuery,
    managedQuery||Promise.resolve({data:[],error:null})
  ]);
  if(ownRes.error)console.warn('Gagal memuat penugasan koordinator milik akun:',ownRes.error.message);
  if(managedRes.error)console.warn('Gagal memuat daftar koordinator organisasi:',managedRes.error.message);

  const assignments=new Map();
  [...(ownRes.data||[]),...(managedRes.data||[])].forEach(x=>assignments.set(String(x.id),x));
  const rows=[...assignments.values()];
  const ids=[...new Set(rows.map(x=>x.akun_id).filter(Boolean))];
  const profiles=ids.length
    ? (await sb.from('profiles').select('id,nama,nim').in('id',ids)).data||[]
    : [];
  const pm=Object.fromEntries(profiles.map(x=>[String(x.id),x]));
  S.coordinatorAssignments=rows.map(x=>({...x,akun:pm[String(x.akun_id)]||null}));
  if(!ownRes.error && !managedRes.error){S.coordinatorAssignmentsCacheKey=cacheKey;S.coordinatorAssignmentsLoadedAt=Date.now();}
}
async function loadClubMembers() {
  S.clubMembers=[];
  if(!sb || !S.orgId)return;
  const org=(S.organizations||[]).find(x=>x.id===S.orgId);
  if(org?.tipe!=='CLUB')return;
  const {data,error}=await sb.from('anggota_non_akun').select('id,organisasi_id,nama,nim,aktif,dibuat_pada').eq('organisasi_id',S.orgId).order('nama');
  if(error)return toast('Gagal memuat anggota UKM Minat Bakat: '+error.message);
  S.clubMembers=data||[];
}

async function loadStructureCatalog() {
  await loadOrganizations();
  await Promise.all([loadJabatanAndUnits(),loadOrganizationRelations(),loadCoordinatorAssignments(),loadClubMembers()]);
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

const VIEW_CACHE_KEYS = {
  beranda:['proker','notifications','budgets','periods'],
  proker:['proker'],
  undangan:['undangan'],
  inbox:['inbox'],
  galeri:['gallery'],
  laporan:['reports'],
  anggota:['anggota','periods'],
  struktur:['structure','units','clubMembers'],
  rapat:['meetings'],
  cair:['proker','payouts','fundUsageProkers'],
  koordinator:['organizations','coordinatorAssignments']
};

function viewCacheKey(view){
  return view+'|'+String(S.orgId||'global')+'|'+String(S.structureOrgId||'');
}

function snapshotView(view){
  const keys=VIEW_CACHE_KEYS[view];
  if(!keys)return;
  const snap={};
  keys.forEach(k=>{snap[k]=Array.isArray(S[k])?[...S[k]]:S[k]});
  S.viewCache[viewCacheKey(view)]={at:Date.now(),data:snap};
}

function restoreView(view){
  const keys=VIEW_CACHE_KEYS[view];
  if(!keys)return false;
  const cached=S.viewCache[viewCacheKey(view)];
  if(!cached || Date.now()-cached.at>S.viewCacheTtl)return false;
  keys.forEach(k=>{S[k]=Array.isArray(cached.data[k])?[...cached.data[k]]:cached.data[k]});
  return true;
}

function htmlCacheKey(view){
  return [view,S.orgId||'global',S.structureOrgId||'',S.tab||'',S.q||'',S.anggotaPeriodId||'',S.anggotaQ||''].join('|');
}
function getHtmlCache(view){
  const cached=S.htmlCache?.[htmlCacheKey(view)];
  return cached && Date.now()-cached.at<S.htmlCacheTtl ? cached.html : null;
}
function setHtmlCache(view,html){
  S.htmlCache[htmlCacheKey(view)]={at:Date.now(),html};
}
function clearHtmlCache(){
  S.htmlCache={};
}

function clearViewCache(){
  S.viewCache={};
  clearHtmlCache();
}

async function loadViewData(view){
  switch(view){
    case 'beranda':
      await Promise.all([loadProker(),loadNotifications(),loadBudgets()]);
      break;
    case 'proker':
      await loadProker();
      break;
    case 'review':
      await Promise.all([loadProkerDetail(),loadSources()]);
      break;
    case 'form':
      await Promise.all([loadSources(),loadOrganizations()]);
      break;
    case 'undangan':
      await loadUndangan();
      break;
    case 'inbox':
      await loadInbox();
      break;
    case 'galeri':
      await loadGallery();
      break;
    case 'laporan':
      await loadReports();
      break;
    case 'anggota':
      await loadAnggota();
      break;
    case 'struktur':
      if(S.user.peran==='dekan')await loadDekanDirectory();
      else await Promise.all([loadStructure(),loadUnits(),loadJabatanAndUnits(),loadClubMembers()]);
      break;
    case 'rapat':
      await loadMeetings();
      break;
    case 'plafon':
      await loadBudgets();
      break;
    case 'cair':
      await loadFundUsage();
      break;
    case 'periode':
      await loadPeriods();
      break;
    case 'organisasi':
      await loadOrganizations();
      await Promise.all([loadPeriods(),loadOrganizationRelations(),loadCoordinatorAssignments()]);
      break;
    case 'unit_kerja':
      await loadStructureCatalog();
      break;
    case 'audit':
      await loadAudit();
      break;
    case 'akun':
      await Promise.all([loadAccounts(),loadOrganizations(),loadJabatanAndUnits()]);
      break;
    case 'jabatan':
      await loadJabatanAndUnits();
      break;
    case 'koordinator':
      await loadOrganizations();
      await loadCoordinatorAssignments({force:true});
      break;
    case 'profil':
      await loadMemberships();
      break;
    default:
      break;
  }
  snapshotView(view);
}


