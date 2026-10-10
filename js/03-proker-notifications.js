/* SIMA MHS: Proker queries, notifications, storage URLs, and document opening. */

async function loadProker(_retry=false) {
  if (!sb) return;
  const requestContextSeq=S.contextSwitchSeq;
  const isAcademicReviewer=isAcademicReviewerRole(S.user.peran);
  const coordinatorAssignmentsPromise=isAcademicReviewer?Promise.resolve():loadCoordinatorAssignments().catch(()=>{});

  const isWakil=S.user.peran==='wakil_rektor';
  const isPembimbing=S.user.peran==='pembimbing';
  const isDekan=S.user.peran==='dekan';
  const activeOrg=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
  const selectFields='id,organisasi_id,unit_id,nama,deskripsi,jadwal_rencana,tanggal_mulai,tanggal_selesai,batas_lpj,tempat,ketua_pelaksana,jenis,pengajuan,status,review_stage,alasan_tidak_terlaksana,dibuat_oleh,sumber_dana_kode,sumber_dana_detail,anggaran_total,anggaran_diajukan,anggaran_disetujui,anggaran_disetujui_oleh,anggaran_disetujui_pada';

  let ownQuery;
  if(isPembimbing){
    // Pembimbing is a permanent read-only observer of the HMJ it supervises.
    // Workflow actions are still exposed only when the current stage belongs
    // to the Pembimbing.
    ownQuery=sb.from('proker')
      .select(selectFields)
      .eq('organisasi_id',S.orgId)
      .order('tanggal_mulai',{ascending:true});
  }else if(S.orgId && !isWakil){
    ownQuery=sb.from('proker')
      .select(selectFields)
      .eq('organisasi_id',S.orgId)
      .order('tanggal_mulai',{ascending:true});
  }else if(isWakil){
    ownQuery=sb.from('proker')
      .select(selectFields)
      .order('tanggal_mulai',{ascending:true});
  }else{
    ownQuery=Promise.resolve({data:[],error:null});
  }

  const {data:collabRows,error:collabError}=(!isWakil&&!isPembimbing&&S.orgId)
    ? await sb.from('proker_kolaborator')
      .select('proker_id,status')
      .eq('organisasi_id',S.orgId)
      .eq('status','bergabung')
    : {data:[],error:null};

  if(collabError){
    const recovered=await handleTransientAuthError(collabError,'loadProker.collaboration');
    if(recovered.retry){
      if(!_retry)return loadProker(true);
    }
    console.warn('Gagal memuat kolaborasi:',collabError.message);
  }

  await coordinatorAssignmentsPromise;
  const collabIds=[...new Set((collabRows||[]).map(x=>x.proker_id).filter(Boolean))];
  const collabQuery=collabIds.length
    ? sb.from('proker').select(selectFields).in('id',collabIds).order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});

  const bemChildIds=activeOrg?.tipe==='BEM'
    ? (S.organizations||[]).filter(o=>['HMJ','UKM','CLUB'].includes(o.tipe)&&String(o.induk_organisasi_id||'')===String(activeOrg.id)).map(o=>o.id)
    : [];
  let bemHmjQuery=Promise.resolve({data:[],error:null});
  if(activeOrg?.tipe==='BEM'&&!isWakil&&!isPembimbing){
    const hmjIds=(S.organizations||[]).filter(o=>o.tipe==='HMJ'&&String(o.induk_organisasi_id||'')===String(S.orgId||'')).map(o=>o.id);
    if(hmjIds.length)bemHmjQuery=sb.from('proker').select(selectFields).in('organisasi_id',hmjIds)
      .in('review_stage',['bem','bem_from_wakil_rektor','bem_lpj','presiden_bem_hmj','presiden_bem_hmj_lpj']).order('tanggal_mulai',{ascending:true});
  }
  const coordinatorOrgIds=[...new Set((S.coordinatorAssignments||[]).filter(x=>x.status==='aktif'&&String(x.akun_id)===String(S.user.id)
    && (x.mulai_pada==null||x.mulai_pada<=new Date().toISOString().slice(0,10))
    && (x.berakhir_pada==null||x.berakhir_pada>=new Date().toISOString().slice(0,10))).map(x=>x.organisasi_id))];
  const coordinatorStages=['koordinator_hmj','koordinator_ukm','koordinator_hmj_lpj','koordinator_ukm_lpj','koordinator_hmj_revisi','koordinator_ukm_revisi','koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi','ukm_koordinator','ukm_koordinator_lpj'];
  const presidentStages=['presiden_bem_hmj','presiden_bem_ukm','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj','ukm_presiden_bem','ukm_presiden_bem_lpj'];
  const isBemPresident=(S.memberships||[]).some(m=>{
    if(!m.jabatan_id||String(m.akun_id)!==String(S.user.id)||m.status!=='aktif')return false;
    const org=(S.organizations||[]).find(o=>String(o.id)===String(m.organisasi_id));
    const pos=(S.positions||[]).find(j=>String(j.id)===String(m.jabatan_id));
    return org?.tipe==='BEM'&&pos?.kode==='presiden';
  });
  const coordinatorQuery=!isWakil&&coordinatorOrgIds.length
    ? sb.from('proker').select(selectFields).in('organisasi_id',coordinatorOrgIds).in('review_stage',coordinatorStages).order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  const coordinatorFollowupQuery=!isWakil&&!isBemPresident&&coordinatorOrgIds.length
    ? sb.from('proker').select(selectFields).in('organisasi_id',coordinatorOrgIds)
      .or('and(status.eq.proposal_diajukan,review_stage.in.(presiden_bem_hmj,hmj_lanjut_kaprodi,kaprodi_hmj,hmj_lanjut_dekan,dekan_hmj,hmj_lanjut_wakil_rektor,wakil_rektor_hmj)),and(status.eq.lpj_diajukan,review_stage.in.(presiden_bem_hmj_lpj,hmj_lanjut_kaprodi_lpj,kaprodi_hmj_lpj,hmj_lanjut_dekan_lpj,dekan_hmj_lpj,hmj_lanjut_wakil_rektor_lpj,wakil_rektor_hmj_lpj)),and(review_stage.is.null,status.in.(disetujui,berjalan,selesai,lpj_disetujui,tidak_terlaksana,arsip))')
      .order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  const presidentQuery=!isWakil&&isBemPresident&&bemChildIds.length
    ? sb.from('proker').select(selectFields).in('organisasi_id',bemChildIds).in('review_stage',presidentStages).order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  const visibleUkmQuery=!isWakil&&bemChildIds.length
    ? sb.from('proker').select(selectFields).in('organisasi_id',bemChildIds)
      .or('and(status.eq.proposal_diajukan,review_stage.in.(wakil_rektor_ukm,wakil_rektor,hmj_lanjut_kaprodi,kaprodi_hmj,hmj_lanjut_dekan,dekan_hmj,hmj_lanjut_wakil_rektor,wakil_rektor_hmj)),and(status.eq.lpj_diajukan,review_stage.in.(wakil_rektor_ukm_lpj,wakil_rektor_lpj,hmj_lanjut_kaprodi_lpj,kaprodi_hmj_lpj,hmj_lanjut_dekan_lpj,dekan_hmj_lpj,hmj_lanjut_wakil_rektor_lpj,wakil_rektor_hmj_lpj)),and(review_stage.is.null,status.in.(disetujui,berjalan,selesai,lpj_disetujui,tidak_terlaksana,arsip))')
      .order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  // A Dekan reviews active HMJ proposal/LPJ stages across every program study.
  const dekanQuery=isDekan
    ? sb.from('proker').select(selectFields).in('review_stage',['dekan_hmj','dekan_hmj_lpj']).order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  // RLS returns only HMJ with a recorded successful Dekan forwarding decision.
  const dekanFollowupQuery=isDekan
    ? sb.from('proker').select(selectFields)
      .or('and(status.eq.proposal_diajukan,review_stage.eq.wakil_rektor_hmj),and(status.eq.lpj_diajukan,review_stage.eq.wakil_rektor_hmj_lpj),and(review_stage.is.null,status.in.(disetujui,berjalan,selesai,lpj_disetujui,tidak_terlaksana,arsip))')
      .order('tanggal_mulai',{ascending:true})
    : Promise.resolve({data:[],error:null});
  const [
    {data:ownRows,error:ownError},{data:collabProkers,error:collabProkerError},
    {data:bemHmjRows,error:bemHmjError},{data:coordinatorRows,error:coordinatorError},
    {data:coordinatorFollowupRows,error:coordinatorFollowupError},
    {data:presidentRows,error:presidentError},{data:visibleUkmRows,error:visibleUkmError},
    {data:dekanRows,error:dekanError},{data:dekanFollowupRows,error:dekanFollowupError}
  ]=await Promise.all([ownQuery,collabQuery,bemHmjQuery,coordinatorQuery,coordinatorFollowupQuery,presidentQuery,visibleUkmQuery,dekanQuery,dekanFollowupQuery]);
  if(ownError)return toast('Gagal memuat proker: '+ownError.message);
  if(collabProkerError)console.warn('Gagal memuat proker kolaborasi:',collabProkerError.message);
  if(bemHmjError)console.warn('Gagal memuat proker HMJ yang menunggu review BEM:',bemHmjError.message);
  if(coordinatorError)console.warn('Gagal memuat proker Koordinator BEM:',coordinatorError.message);
  if(coordinatorFollowupError)console.warn('Gagal memuat proker pantauan koordinator:',coordinatorFollowupError.message);
  if(presidentError)console.warn('Gagal memuat proker review Presiden BEM:',presidentError.message);
  if(visibleUkmError)console.warn('Gagal memuat proker setelah persetujuan Presiden BEM:',visibleUkmError.message);
  if(dekanError)console.warn('Gagal memuat antrean review Dekan Fakultas:',dekanError.message);
  if(dekanFollowupError)console.warn('Gagal memuat proker pantauan Dekan Fakultas:',dekanFollowupError.message);
  const own=(ownRows||[]).map(x=>({...x,__collaborator:false}));
  const collab=(collabProkers||[]).map(x=>({...x,__collaborator:true}));
  const childHmjs=(bemHmjRows||[]).map(x=>({...x,__collaborator:false,__hmjReview:true}));
  const coordinatorRowsMarked=(coordinatorRows||[]).map(x=>({...x,__collaborator:false,__coordinatorReview:true}));
  const coordinatorFollowupRowsMarked=(coordinatorFollowupRows||[]).map(x=>({...x,__collaborator:false,__coordinatorReadOnly:true}));
  const presidentRowsMarked=(presidentRows||[]).map(x=>({...x,__collaborator:false,__presidentReview:true}));
  const visibleUkm=(visibleUkmRows||[]).map(x=>({...x,__collaborator:false,__ukmBphReadOnly:true}));
  const dekanReviewRows=(dekanRows||[]).map(x=>({...x,__collaborator:false,__dekanReview:true}));
  const dekanFollowupRowsMarked=(dekanFollowupRows||[]).map(x=>({...x,__collaborator:false,__dekanReadOnly:true}));
  const map=new Map();
  [...own,...collab,...childHmjs,...coordinatorRowsMarked,...presidentRowsMarked,...visibleUkm,...dekanReviewRows].forEach(x=>map.set(x.id,{...(map.get(x.id)||{}),...x}));
  coordinatorFollowupRowsMarked.forEach(x=>{if(!map.has(x.id))map.set(x.id,x);});
  dekanFollowupRowsMarked.forEach(x=>{if(!map.has(x.id))map.set(x.id,x);});
  const rows=[...map.values()];

  const ids=rows.map(x=>x.id);
  const orgIds=[...new Set(rows.map(x=>x.organisasi_id).filter(Boolean))];
  const totals=Object.fromEntries(ids.map(id=>[id,{cair:0}]));

  const [orgRes,payoutRes]=await Promise.all([
    orgIds.length?sb.from('organisasi').select('id,nama,tipe,induk_organisasi_id').in('id',orgIds):Promise.resolve({data:[],error:null}),
    ids.length?sb.from('pencairan_dana').select('proker_id,jumlah').in('proker_id',ids):Promise.resolve({data:[],error:null})
  ]);

  const orgMap=Object.fromEntries((orgRes.data||[]).map(o=>[o.id,o]));
  (payoutRes.data||[]).forEach(x=>{if(totals[x.proker_id])totals[x.proker_id].cair+=Number(x.jumlah||0);});

  if(requestContextSeq!==S.contextSwitchSeq)return;

  S.proker=rows.map(p=>({
    ...p,
    organisasi:orgMap[p.organisasi_id]||null,
    ketua:p.ketua_pelaksana||'-',
    mulai:p.tanggal_mulai||'-',
    ajuan:Number(p.anggaran_diajukan||0),
    cair:totals[p.id]?.cair||0
  }));
}

async function loadNotifications({silent=false,force=false}={}) {
  if (!sb || !S.user.id) return;
  if(S.notificationsLoadPromise)return S.notificationsLoadPromise;
  if(!force && Date.now()-Number(S.notificationsLoadedAt||0)<4000)return;

  const userId=S.user.id;
  const request=(async()=>{
    const { data, error } = await sb.from('notifikasi')
      .select('id,akun_id,organisasi_id,pesan,tautan,dibaca,dibuat')
      .eq('akun_id', userId)
      .order('dibuat', { ascending:false })
      .limit(50);
    if(error){
      if(!silent)console.warn('Gagal memuat notifikasi:',error);
      return;
    }
    if(String(S.user.id)!==String(userId))return;
    S.notifications=Array.isArray(data)?data.map(n=>({
      id:n.id,title:'Notifikasi',message:n.pesan||'',type:'info',
      read:!!n.dibaca,created_at:n.dibuat,view:n.tautan||''
    })):[];
    S.notificationsLoadedAt=Date.now();
    renderNotificationPanel();
  })();

  S.notificationsLoadPromise=request;
  try{return await request;}
  finally{if(S.notificationsLoadPromise===request)S.notificationsLoadPromise=null;}
}

async function setupNotificationRealtime() {
  if (!sb || !S.user.id) return;

  if (S.notificationChannel) {
    await sb.removeChannel(S.notificationChannel).catch(error =>
      console.warn('Gagal mengganti channel notifikasi:', error)
    );
    S.notificationChannel = null;
  }

  const userId = S.user.id;
  S.notificationChannel = sb
    .channel('sima-notifications-' + userId)
    .on(
      'postgres_changes',
      {
        event:'INSERT',
        schema:'public',
        table:'notifikasi',
        filter:'akun_id=eq.' + userId
      },
      payload => {
        const row = payload.new;
        if (!row || String(row.akun_id) !== String(userId)) return;

        const exists = S.notifications.some(n => String(n.id) === String(row.id));
        if (!exists) {
          S.notifications.unshift({
            id:row.id,
            title:'Notifikasi',
            message:row.pesan || '',
            type:'info',
            read:!!row.dibaca,
            created_at:row.dibuat,
            view:row.tautan || ''
          });
          S.notifications = S.notifications
            .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
            .slice(0,50);
        }

        renderNotificationPanel();

        if (typeof toast === 'function' && row.pesan) {
          toast(row.pesan);
        }
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.info('Realtime notifikasi aktif untuk akun:', userId);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime notifikasi gagal:', status);
      }
    });

  await loadNotifications({silent:true});
}

const ACTIVITY_THUMB_URL_TTL_MS = 8 * 60 * 1000;

async function getActivityThumbnailUrls(paths) {
  const result=new Map();
  if(!sb)return result;
  if(!(S.activityThumbUrlCache instanceof Map))S.activityThumbUrlCache=new Map();
  const unique=[...new Set((paths||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const now=Date.now(),missing=[];
  unique.forEach(path=>{
    const cached=S.activityThumbUrlCache.get(String(S.user?.id||'')+'|'+path);
    if(cached && cached.expiresAt>now+45000)result.set(path,cached.url);
    else missing.push(path);
  });
  for(let offset=0;offset<missing.length;offset+=50){
    const chunk=missing.slice(offset,offset+50);
    try{
      const {data,error}=await sb.storage.from('activity-photos').createSignedUrls(chunk,600);
      if(error){console.warn('Gagal membuat signed URL thumbnail batch:',error.message);continue;}
      const rows=Array.isArray(data)?data:[];
      let failed=0;
      chunk.forEach((path,index)=>{
        const item=rows[index]||{},url=item.signedUrl||item.signedURL||'';
        if(!url||item.error){failed++;return;}
        result.set(path,url);
        S.activityThumbUrlCache.set(String(S.user?.id||'')+'|'+path,{url,expiresAt:Date.now()+ACTIVITY_THUMB_URL_TTL_MS});
      });
      if(failed)console.warn('Sebagian thumbnail tidak dapat ditandatangani:',failed);
    }catch(error){console.warn('Permintaan signed URL thumbnail gagal:',error?.message||error);}
  }
  return result;
}

async function openSignedDocument(path) {
  if(!sb){toast('Supabase belum tersedia.');return false;}
  if(!path){toast('Lokasi dokumen tidak tersedia.');return false;}

  // Reserve a tab during the click gesture so browsers do not block it after the async signed-URL request.
  const viewer=window.open('about:blank','_blank');
  if(viewer){try{viewer.opener=null;}catch(_){}}
  try{
    const {data,error}=await sb.storage.from('documents').createSignedUrl(path,600);
    if(error||!data?.signedUrl){
      if(viewer){try{viewer.close();}catch(_){}}
      console.error('Gagal membuat signed URL dokumen:',error||'signed URL kosong');
      toast('Gagal membuat link dokumen: '+(error?.message||'Tidak dapat mengakses file.'));
      return false;
    }
    if(viewer)viewer.location.replace(data.signedUrl);
    else{
      toast('Pop-up diblokir browser; dokumen dibuka di tab ini.');
      window.location.assign(data.signedUrl);
    }
    return true;
  }catch(error){
    if(viewer){try{viewer.close();}catch(_){}}
    console.error('Gagal membuka dokumen:',error);
    toast('Gagal membuka dokumen: '+(error?.message||'Terjadi kesalahan.'));
    return false;
  }
}
