/* SIMA MHS: detail loading, collaboration inbox, gallery, and reports. */

async function loadProkerDetail() {
  S.detail = null;
  if (!sb || !S.selectedProkerId) return;

  const { data:proker, error } = await sb.from('proker')
    .select('id,organisasi_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,review_stage,alasan_tidak_terlaksana,dibuat_oleh,sumber_dana_kode,sumber_dana_detail,anggaran_total,anggaran_diajukan,anggaran_disetujui,anggaran_disetujui_oleh,anggaran_disetujui_pada')
    .eq('id', S.selectedProkerId).single();
  if (error) return toast('Gagal memuat detail proker: ' + error.message);

  const readOnlyAssignedCoordinator=(S.proker||[]).some(row=>String(row.id)===String(S.selectedProkerId)&&row.__coordinatorReadOnly===true);
  const readOnlyDekanFollowup=(S.proker||[]).some(row=>String(row.id)===String(S.selectedProkerId)&&row.__dekanReadOnly===true);

  // Read all documents authorized for this account under dokumen RLS.
  // Do not use the Wakil Rektor review-only RPC here: it filters out documents
  // that have already passed the active stage and would hide their history.
  const docsResult = await sb.from('dokumen')
    .select('id,proker_id,organisasi_id,jenis,status,tahap,file_path,file_name,mime_type,file_size,uploaded_by,uploaded_at')
    .eq('proker_id',S.selectedProkerId)
    .order('jenis');

  if(docsResult.error){
    S.detail=null;
    return toast('Gagal memuat dokumen proker: '+docsResult.error.message);
  }

  const docsRows=Array.isArray(docsResult.data)?docsResult.data:[];
  const docIds=docsRows.map(x=>x.id);

  const [orgRes, kolab, decisions, photoRows] = await Promise.all([
    proker.organisasi_id
      ? sb.from('organisasi').select('id,nama,tipe,periode_id,induk_organisasi_id').eq('id',proker.organisasi_id).maybeSingle()
      : Promise.resolve({data:null}),
    sb.from('proker_kolaborator').select('proker_id,organisasi_id,status,porsi_plafon,komentar').eq('proker_id',S.selectedProkerId),
    docIds.length
      ? sb.from('persetujuan').select('id,dokumen_id,versi_id,tahap,keputusan,komentar,oleh,sebagai,waktu').in('dokumen_id',docIds).order('waktu',{ascending:false})
      : Promise.resolve({data:[]}),
    sb.from('foto_kegiatan').select('id,proker_id,dokumen_id,file_name,mime_type,thumb_path,ukuran_byte,urutan,keterangan,diunggah_oleh,uploaded_at').eq('proker_id',S.selectedProkerId).order('urutan',{ascending:true})
  ]);

  const decisionError=decisions?.error?.message||null;
  if(decisionError)console.warn('Gagal memuat riwayat persetujuan:',decisionError);
  const decisionRows=Array.isArray(decisions?.data)?decisions.data:[];
  const photos=Array.isArray(photoRows?.data)?photoRows.data:[];
  const decisionActorIds=[...new Set(decisionRows.map(x=>x.oleh).filter(Boolean))];
  const uploaderIds=[...new Set(photos.map(x=>x.diunggah_oleh).filter(Boolean))];
  const periodId=orgRes.data?.periode_id||null;
  const needsBudgetStatus=S.user.peran==='wakil_rektor' && proker.status==='proposal_diajukan'
    && NEW_WR_STAGES.has(proker.review_stage)
    && !String(proker.review_stage).endsWith('_lpj')
    && proker.sumber_dana_kode==='KAMPUS';

  const [decisionActorResult,budgetResult,uploaderResult,thumbUrls]=await Promise.all([
    decisionActorIds.length?sb.from('profiles').select('id,nama').in('id',decisionActorIds):Promise.resolve({data:[],error:null}),
    needsBudgetStatus&&periodId?sb.rpc('get_anggaran_periode_status',{p_periode_id:periodId}):Promise.resolve({data:null,error:null}),
    uploaderIds.length?sb.from('profiles').select('id,nama').in('id',uploaderIds):Promise.resolve({data:[],error:null}),
    getActivityThumbnailUrls(photos.map(x=>x.thumb_path))
  ]);
  if(decisionActorResult.error)console.warn('Nama reviewer tidak dapat dimuat:',decisionActorResult.error.message);
  if(budgetResult.error)console.warn('Status plafon tidak dapat dimuat:',budgetResult.error.message);
  const decisionActorMap=Object.fromEntries((decisionActorResult.data||[]).map(x=>[String(x.id),x.nama]));
  const budgetRows=Array.isArray(budgetResult.data)?budgetResult.data:(budgetResult.data?[budgetResult.data]:[]);
  const budgetStatus=budgetRows[0]||null;
  const uploaderMap=Object.fromEntries((uploaderResult.data||[]).map(x=>[x.id,x]));
  const photoWithUrls=photos.map(x=>({...x,thumb_url:x.thumb_path?(thumbUrls.get(x.thumb_path)||''):'',uploader:uploaderMap[x.diunggah_oleh]||null}));

  S.detail = {
    proker:{...proker,organisasi:orgRes.data || null,__coordinatorReadOnly:readOnlyAssignedCoordinator,__dekanReadOnly:readOnlyDekanFollowup},
    readOnlyDekanFollowup,
    docs:docsRows,
    kolaborator:kolab.data || [],
    keputusan:decisionRows.map(x=>({
      ...x,
      nama_oleh:decisionActorMap[String(x.oleh)]||null,
      dokumen_jenis:docsRows.find(d=>String(d.id)===String(x.dokumen_id))?.jenis||null
    })),
    decisionError,
    photos:photoWithUrls,
    budgetStatus,
    readOnlyCollaborator: String(proker.organisasi_id)!==String(S.orgId||'') &&
      (kolab.data||[]).some(x=>String(x.organisasi_id)===String(S.orgId||'') && x.status==='bergabung'),
    readOnlyAssignedCoordinator
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

  if(!isAcademicReviewerRole(S.user.peran))await loadCoordinatorAssignments();
  const activeOrg=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
  let rows=[];

  if(S.user.peran==='pembimbing'){
    // Reviewer inbox: only proposals currently routed to this Pembimbing.
    const {data,error}=await sb.from('dokumen')
      .select('id,organisasi_id,proker_id,jenis,status,tahap')
      .in('jenis',['proposal','laporan_akhir'])
      .in('tahap',['pembimbing_hmj','pembimbing_hmj_lpj'])
      .order('id',{ascending:false});
    if(error)return toast('Gagal memuat inbox Pembimbing: '+error.message);
    rows=data||[];
  }else if(['kaprodi','dekan'].includes(S.user.peran)){
    const stages=S.user.peran==='kaprodi'?['kaprodi_hmj','kaprodi_hmj_lpj']:['dekan_hmj','dekan_hmj_lpj'];
    const {data,error}=await sb.from('dokumen').select('id,organisasi_id,proker_id,jenis,status,tahap')
      .in('jenis',['proposal','laporan_akhir']).in('tahap',stages).eq('status','diajukan').order('id',{ascending:false});
    if(error)return toast('Gagal memuat inbox '+roleLabel(S.user.peran)+': '+error.message);
    rows=data||[];
  }else if(activeOrg?.tipe==='BEM'){
    // The BEM inbox contains only child-organization documents currently
    // awaiting a BEM reviewer. BEM-owned proposals go directly to WR1.
    const childIds=(S.organizations||[]).filter(o=>['HMJ','UKM','CLUB'].includes(o.tipe)&&String(o.induk_organisasi_id||'')===String(S.orgId||'')).map(o=>o.id);
    const {data,error}=childIds.length
      ? await sb.from('dokumen')
        .select('id,organisasi_id,proker_id,jenis,status,tahap')
        .in('organisasi_id',childIds)
        .in('jenis',['proposal','laporan_akhir'])
        .in('tahap',['bem','bem_from_wakil_rektor','bem_lpj','presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj'])
        .eq('status','diajukan')
        .order('id',{ascending:false})
      : {data:[],error:null};
    if(error)return toast('Gagal memuat inbox BEM: '+error.message);
    rows=data||[];
  }else if(S.user.peran==='wakil_rektor'){
    // Use the reviewer RPC so RLS on the legacy dokumen table cannot hide
    // an active proposal/LPJ from the campus-wide reviewer.
    const {data,error}=await sb.rpc('get_wakil_rektor_review_documents',{p_proker_id:null});
    if(error)return toast('Gagal memuat inbox Wakil Rektor: '+error.message);
    rows=(data||[]).map(x=>({id:x.id,organisasi_id:x.organisasi_id,proker_id:x.proker_id,jenis:x.jenis,status:x.status,tahap:x.tahap}));
    const {data:newStageDocs,error:newStageError}=await sb.from('dokumen').select('id,organisasi_id,proker_id,jenis,status,tahap')
      .in('jenis',['proposal','laporan_akhir']).in('tahap',['wakil_rektor_ukm','wakil_rektor_hmj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'])
      .eq('status','diajukan').order('id',{ascending:false});
    if(newStageError)console.warn('Gagal memuat inbox alur baru Wakil Rektor 1:',newStageError.message);
    const existingIds=new Set(rows.map(x=>String(x.id)));
    (newStageDocs||[]).forEach(x=>{if(!existingIds.has(String(x.id)))rows.push(x);});
  }else if(S.orgId){
    const {data,error}=await sb.from('dokumen').select('id,organisasi_id,proker_id,jenis,status,tahap').eq('organisasi_id',S.orgId).order('id',{ascending:false});
    if(error)return toast('Gagal memuat inbox: '+error.message);
    rows=data||[];
  }

  // Add UKM proposals/LPJs assigned to the signed-in coordinator regardless
  // of the currently selected BEM ministry/context.
  const coordinatorUkmIds=[...new Set((S.coordinatorAssignments||[])
    .filter(x=>x.status==='aktif' && String(x.akun_id)===String(S.user.id))
    .map(x=>x.organisasi_id))];
  if(coordinatorUkmIds.length){
    const {data:ukmDocs,error:ukmInboxError}=await sb.from('dokumen')
      .select('id,organisasi_id,proker_id,jenis,status,tahap')
      .in('organisasi_id',coordinatorUkmIds)
      .in('jenis',['proposal','laporan_akhir'])
      .in('tahap',['koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj','koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi','ukm_koordinator','ukm_koordinator_lpj'])
      .eq('status','diajukan')
      .order('id',{ascending:false});
    if(ukmInboxError){
      console.warn('Gagal memuat inbox Koordinator UKM:',ukmInboxError.message);
    }else{
      const seen=new Set(rows.map(x=>String(x.id)));
      (ukmDocs||[]).forEach(x=>{if(!seen.has(String(x.id)))rows.push(x);});
    }
  }

  const ids=[...new Set(rows.map(x=>x.proker_id).filter(Boolean))];
  const orgIds=[...new Set(rows.map(x=>x.organisasi_id).filter(Boolean))];
  const [prokerRes,orgRes]=await Promise.all([
    ids.length?sb.from('proker').select('id,nama,status,review_stage').in('id',ids):Promise.resolve({data:[],error:null}),
    orgIds.length?sb.from('organisasi').select('id,nama,tipe').in('id',orgIds):Promise.resolve({data:[],error:null})
  ]);
  if(prokerRes.error)console.warn('Gagal memuat nama proker di inbox:',prokerRes.error.message);
  if(orgRes.error)console.warn('Gagal memuat organisasi di inbox:',orgRes.error.message);
  const pmap=Object.fromEntries((prokerRes.data||[]).map(x=>[x.id,x]));
  const omap=Object.fromEntries((orgRes.data||[]).map(x=>[x.id,x]));
  S.inbox=rows.map(x=>({...x,proker:pmap[x.proker_id],organisasi:omap[x.organisasi_id]}));
}

async function loadGallery({force=false}={}) {
  if(!sb)return;
  const now=Date.now();
  if(!force&&S.galleryLoadedAt&&now-S.galleryLoadedAt<45000)return S.gallery;
  if(!force&&S.galleryLoadPromise)return S.galleryLoadPromise;

  const request=(async()=>{
    const {data,error}=await sb.from('foto_kegiatan')
      .select('id,proker_id,dokumen_id,drive_file_id,thumb_path,file_name,mime_type,ukuran_byte,urutan,keterangan,diunggah_oleh,uploaded_at')
      .order('proker_id').order('urutan');
    if(error){
      console.warn('Gagal memuat galeri:',error.message);
      if(!S.gallery.length)toast('Gagal memuat galeri: '+error.message);
      return S.gallery;
    }

    const rows=Array.isArray(data)?data:[];
    const ids=[...new Set(rows.map(x=>x.proker_id).filter(Boolean))];
    const userIds=[...new Set(rows.map(x=>x.diunggah_oleh).filter(Boolean))];
    const grouped=new Map();
    rows.forEach(photo=>{
      const key=String(photo.proker_id);
      if(!grouped.has(key))grouped.set(key,{proker_id:photo.proker_id,photos:[]});
      grouped.get(key).photos.push(photo);
    });
    const groups=[...grouped.values()].map(group=>{
      const photos=[...group.photos].sort((a,b)=>Number(a.urutan||0)-Number(b.urutan||0));
      const cover=photos.find(x=>x.thumb_path)||photos[0]||null;
      return {...group,photos,cover,photo_count:photos.length};
    });
    const coverPaths=groups.map(group=>group.cover?.thumb_path).filter(Boolean);
    const organizationLoad=(Array.isArray(S.organizations)&&S.organizations.length)
      ? Promise.resolve()
      : loadOrganizations();

    const [prokerResult,userResult,membershipResult,coverUrls]=await Promise.all([
      ids.length?sb.from('proker').select('id,nama,organisasi_id,tanggal_mulai,tanggal_selesai').in('id',ids):Promise.resolve({data:[],error:null}),
      userIds.length?sb.from('profiles').select('id,nama').in('id',userIds):Promise.resolve({data:[],error:null}),
      userIds.length?sb.from('keanggotaan').select('akun_id,organisasi_id,status').in('akun_id',userIds).eq('status','aktif'):Promise.resolve({data:[],error:null}),
      getActivityThumbnailUrls(coverPaths),
      organizationLoad
    ]);
    if(prokerResult.error)console.warn('Gagal memuat nama Proker galeri:',prokerResult.error.message);
    if(userResult.error)console.warn('Gagal memuat nama pengunggah galeri:',userResult.error.message);
    if(membershipResult.error)console.warn('Gagal memuat organisasi pengunggah foto:',membershipResult.error.message);

    const pmap=Object.fromEntries((prokerResult.data||[]).map(x=>[x.id,x]));
    const umap=Object.fromEntries((userResult.data||[]).map(x=>[x.id,x]));
    const membershipRows=Array.isArray(membershipResult.data)?membershipResult.data:[];
    const membershipsByUser=new Map();
    membershipRows.forEach(row=>{
      if(!membershipsByUser.has(row.akun_id))membershipsByUser.set(row.akun_id,[]);
      membershipsByUser.get(row.akun_id).push(row);
    });
    const uploaderOrgIds=[...new Set(membershipRows.map(x=>x.organisasi_id).filter(Boolean))];
    const knownOrganizations=Array.isArray(S.organizations)?S.organizations:[];
    const knownIds=new Set(knownOrganizations.map(x=>String(x.id)));
    const missingOrgIds=uploaderOrgIds.filter(id=>!knownIds.has(String(id)));
    let fallbackOrganizations=[];
    if(missingOrgIds.length){
      const fallback=await sb.from('organisasi').select('id,nama,tipe').in('id',missingOrgIds);
      if(fallback.error)console.warn('Gagal memuat label organisasi galeri:',fallback.error.message);
      fallbackOrganizations=fallback.data||[];
    }
    const uploaderOrgMap=Object.fromEntries([...knownOrganizations,...fallbackOrganizations].map(x=>[x.id,x]));

    S.gallery=groups.map(group=>{
      const photos=group.photos.map(photo=>{
        const memberships=membershipsByUser.get(photo.diunggah_oleh)||[];
        const preferred=memberships.find(m=>String(m.organisasi_id)===String(pmap[photo.proker_id]?.organisasi_id||''))||memberships[0]||null;
        return {
          ...photo,
          proker:pmap[photo.proker_id]||null,
          uploader:umap[photo.diunggah_oleh]||null,
          uploader_organization:preferred?(uploaderOrgMap[preferred.organisasi_id]||null):null,
          thumb_url:photo.thumb_path?(coverUrls.get(photo.thumb_path)||''):''
        };
      });
      const cover=photos.find(x=>String(x.id)===String(group.cover?.id))||photos[0]||null;
      return {...group,proker:pmap[group.proker_id]||null,photos,cover};
    });
    S.galleryLoadedAt=Date.now();
    return S.gallery;
  })();

  S.galleryLoadPromise=request;
  try{return await request;}
  finally{if(S.galleryLoadPromise===request)S.galleryLoadPromise=null;}
}

async function loadAnggota() {
  S.anggota=[];
  if(!sb || !S.user.id) return;

  if(!Array.isArray(S.periods) || !S.periods.length){
    await loadPeriods();
  }
  if(!Array.isArray(S.organizations) || !S.organizations.length){
    await loadOrganizations();
  }

  const role=S.user.peran;
  let allowedPeriodIds=[];

  if(role==='wakil_rektor'){
    allowedPeriodIds=[...new Set(
      (S.organizations||[])
        .filter(o=>o.tipe==='BEM' && o.periode_id)
        .map(o=>o.periode_id)
    )];
  }else if(role==='pembimbing'){
    const current=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
    if(current?.tipe==='HMJ'){
      allowedPeriodIds=[...new Set(
        (S.organizations||[])
          .filter(o=>o.tipe==='HMJ' && o.periode_id && String(o.nama).toLowerCase()===String(current.nama).toLowerCase())
          .map(o=>o.periode_id)
      )];
    }
  }

  const periodOptions=(S.periods||[]).filter(p=>allowedPeriodIds.includes(p.id));
  if(!periodOptions.length){
    S.anggota=[];
    S.anggotaPeriodId=null;
    return;
  }

  if(!S.anggotaPeriodId || !allowedPeriodIds.includes(S.anggotaPeriodId)){
    const active=(periodOptions||[]).find(p=>p.status==='aktif');
    S.anggotaPeriodId=active?.id || periodOptions[0].id;
  }

  const {data,error}=await sb.rpc('get_visible_member_directory',{
    p_periode_id:S.anggotaPeriodId
  });

  if(error){
    S.anggota=[];
    return toast('Gagal memuat anggota: '+(error.message||'Tidak dapat memuat daftar anggota.'));
  }

  S.anggota=Array.isArray(data)?data:[];
}
