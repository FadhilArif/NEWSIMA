/* SIMA MHS: click delegation for page actions, uploads, and workflow controls. */

document.addEventListener('click', async e => {
  if(e.target.closest('[data-dekan-directory-reset]')){
    S.dekanDirectoryHmjId='';S.dekanDirectoryHmjQ='';S.dekanDirectoryMemberQ='';
    const hmjQ=$('#dekan-hmj-q'),memberQ=$('#dekan-member-q'),hmjFilter=$('#dekan-hmj-filter');
    if(hmjQ)hmjQ.value='';
    if(memberQ)memberQ.value='';
    if(hmjFilter)hmjFilter.value='';
    refreshDekanDirectoryResults();return;
  }
  if(e.target.closest('[data-dekan-directory-refresh]')){
    S.dekanDirectoryLoadedAt=0;S.dekanDirectoryError='';
    await loadDekanDirectory({force:true});
    const root=$('#v');if(root)root.innerHTML=buildViewHtml('struktur');
    renderShell();return;
  }
  if (e.target.closest('#backBtn')) return goBack();

  if (e.target.closest('#notifBtn')) {
    const p=$('#notifPanel');
    if(p) p.hidden=!p.hidden;
    const m=$('#profileMenu'); if(m)m.hidden=true;

    // Refresh once when the bell is opened so the inbox stays correct even
    // when Realtime was temporarily unavailable.
    if(p && !p.hidden) await loadNotifications({silent:true,force:true});
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
        if(n.view) navigate(n.view);
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

  const galleryCard=e.target.closest('[data-gallery-proker]');
  if(galleryCard){
    openActivityGallery(galleryCard.dataset.galleryProker);
    return;
  }

  const galleryClose=e.target.closest('[data-gallery-close]');
  if(galleryClose){
    closeActivityGallery();
    return;
  }

  const unitDelete=e.target.closest('[data-unit-delete]');
  if(unitDelete){
    if(S.user.peran!=='admin')return toast('Hanya administrator yang boleh menghapus Kementerian atau Divisi.');
    if(!sb)return toast('Supabase belum tersedia.');
    const unitId=String(unitDelete.dataset.unitDelete||'').trim();
    const unitName=String(unitDelete.dataset.unitName||'unit ini').trim();
    const selectedOrgId=S.structureOrgId||S.orgId;
    const targetUnit=(S.units||[]).find(x=>String(x.id)===unitId);
    if(!targetUnit||!unitId)return toast('Unit tidak ditemukan. Muat ulang struktur organisasi.');
    if(!selectedOrgId||String(targetUnit.organisasi_id)!==String(selectedOrgId))return toast('Unit tidak termasuk organisasi yang sedang dipilih.');
    if(!['kementerian','divisi'].includes(targetUnit.jenis))return toast('Hanya Kementerian atau Divisi yang dapat dihapus dari halaman ini.');
    if(window.prompt('Penghapusan unit "'+unitName+'". Ketik HAPUS untuk melanjutkan:')!=='HAPUS')return;
    const {error}=await sb.rpc('admin_delete_unit',{p_unit_id:unitId});
    if(error){
      const message=error.message||'Terjadi kesalahan.';
      if(message.includes('UNIT_IN_USE')){
        const detail=message.split('UNIT_IN_USE:')[1]?.trim()||'unit masih dipakai data lain';
        return toast('Tidak dapat menghapus unit yang masih dipakai. '+detail+'. Pindahkan relasinya terlebih dahulu.');
      }
      if(message.includes('UNIT_TYPE_NOT_DELETABLE'))return toast('Hanya Kementerian atau Divisi yang dapat dihapus.');
      if(message.includes('UNIT_NOT_FOUND'))return toast('Unit sudah tidak ditemukan. Muat ulang halaman.');
      if(message.includes('ADMIN_REQUIRED'))return toast('Akses ditolak. Hanya admin yang dapat menghapus unit.');
      return toast('Gagal menghapus unit: '+message);
    }
    toast(unitName+' berhasil dihapus.');
    S.viewCache={};S.htmlCache={};
    return render({force:true});
  }

  const prokerRef=e.target.closest('[data-proker-id]');
  if(prokerRef) S.selectedProkerId=prokerRef.dataset.prokerId;

  const go=e.target.closest('[data-go]');
  if(go)return navigate(go.dataset.go);

  const tab=e.target.closest('[data-tab]');
  if(tab){S.tab=tab.dataset.tab;clearHtmlCache();return render();}

  if(e.target.id==='tp'){pesertaRow();return hitung();}
  if(e.target.closest('[data-del]')){e.target.closest('.peserta')?.remove();return hitung();}
  if(e.target.id==='btn-csv')return prosesBulkCSV();

  const prokerEdit=e.target.closest('[data-proker-edit]');
  if(prokerEdit){
    if(!sb)return toast('Supabase belum tersedia.');
    const id=prokerEdit.dataset.prokerEdit;
    const p=S.detail?.proker;
    if(!p||String(p.id)!==String(id))return toast('Proker tidak ditemukan.');
    if(!['direncanakan','revisi'].includes(p.status))return toast('Proker hanya dapat diedit saat direncanakan atau perlu revisi.');
    if(S.detail.readOnlyCollaborator)return toast('Kolaborator hanya dapat melihat proker.');
    if(S.user.peran==='wakil_rektor')return toast('Wakil Rektor hanya dapat melihat dan mereview.');
    if(!(S.permissions?.has('proker.edit')||S.user.peran==='admin'))return toast('Anda tidak memiliki hak edit proker.');
    S.editProkerId=id;
    S.selectedProkerId=id;
    clearHtmlCache();
    return navigate('form');
  }

  const prokerDelete=e.target.closest('[data-proker-delete]');
  if(prokerDelete){
    if(!sb)return toast('Supabase belum tersedia.');
    const id=prokerDelete.dataset.prokerDelete;
    if(!id)return;
    const p=S.detail?.proker;
    if(!p)return toast('Detail Proker tidak ditemukan.');

    if(!['draft','direncanakan','revisi'].includes(p.status)){
      return toast('Proker pada tahap ini tidak dapat dihapus.');
    }

    const confirmed=await openDeleteProkerModal(p);
    if(!confirmed)return;

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

  const activityPhotoUpload=e.target.closest('[data-activity-photo-upload]');
  if(activityPhotoUpload){
    if(!sb)return toast('Supabase belum tersedia.');

    // Capture the selected File objects immediately. A later render must not
    // be able to clear/change the user's selection before the queued upload runs.
    const prokerId=activityPhotoUpload.dataset.prokerId||S.selectedProkerId;
    const input=$('#activity-photo-input');
    const files=[...(input?.files||[])];
    if(!prokerId)return toast('Proker tidak ditemukan.');
    if(!files.length)return toast('Pilih foto kegiatan terlebih dahulu.');

    const allowed=['image/jpeg','image/png','image/webp','image/gif'];
    for(const file of files){
      if(!allowed.includes(file.type))return toast('Format '+file.name+' tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.');
      if(file.size>10*1024*1024)return toast('Foto '+file.name+' melebihi batas 10 MB.');
    }

    return withUploadLock('foto-kegiatan',async()=>{
    const currentCount=Number(S.detail?.photos?.length||0);
    const remaining=Math.max(0,5-currentCount);
    if(!remaining)return toast('Maksimal 5 foto kegiatan sudah tercapai.');
    if(files.length>remaining)return toast('Foto yang dipilih melebihi sisa slot. Maksimal '+remaining+' foto lagi.');

    const totalIncoming=files.reduce((sum,file)=>sum+file.size,0);
    const quota=await loadStorageStatus(totalIncoming);
    if(quota && !quota.can_upload){
      return toast('Penyimpanan SIMA tidak cukup untuk foto yang dipilih.');
    }

    const proker=S.detail?.proker;
    if(!proker?.organisasi_id)return toast('Organisasi Proker tidak ditemukan.');
    if(!['selesai','lpj_diajukan','lpj_disetujui'].includes(proker.status)){
      return toast('Foto kegiatan baru dapat diunggah setelah kegiatan selesai.');
    }

    activityPhotoUpload.disabled=true;
    if(input)input.disabled=true;

    const bucket=sb.storage.from('activity-photos');
    const uploadedPaths=[];
    const uploadedRecords=[];
    let completed=0;

    try{
      const lpjDoc=S.detail?.docs?.find(x=>x.jenis==='laporan_akhir')||null;
      updateActivityPhotoProgress(0,files.length,'Memulai upload '+files.length+' foto...');

      const uploadResults=await mapWithConcurrency(files,2,async(file,index)=>{
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        const path=proker.organisasi_id+'/'+prokerId+'/foto/'+Date.now()+'_'+index+'_'+crypto.randomUUID()+'_'+safeName;

        await uploadStorageFile('activity-photos',path,file,{
          contentType:file.type,
          onProgress:(uploaded,total)=>{
            const percent=total ? Math.round(uploaded/total*100) : 100;
            updateActivityPhotoProgress(completed,files.length,'Mengunggah foto '+(index+1)+'/'+files.length+' ('+percent+'%)...');
          }
        });

        uploadedPaths.push(path);
        completed+=1;
        updateActivityPhotoProgress(completed,files.length,'Mengunggah '+completed+' dari '+files.length+' foto...');

        return {
          proker_id:prokerId,
          dokumen_id:lpjDoc?.id||null,
          drive_file_id:null,
          thumb_path:path,
          ukuran_byte:file.size,
          urutan:currentCount+index+1,
          keterangan:null,
          diunggah_oleh:S.user.id,
          file_name:file.name,
          mime_type:file.type,
          uploaded_at:new Date().toISOString()
        };
      });

      updateActivityPhotoProgress(files.length,files.length,'Menyimpan metadata foto...');
      const dbResult=await sb.from('foto_kegiatan')
        .insert(uploadResults)
        .select('id');

      if(dbResult.error){
        throw new Error('Metadata foto gagal disimpan: '+dbResult.error.message);
      }

      updateActivityPhotoProgress(files.length,files.length,files.length+' foto berhasil diunggah.');
      S.galleryLoadedAt=0;
      await loadProkerDetail();
      await loadGallery({force:true});

      toast(files.length+' foto kegiatan berhasil diunggah sekaligus.');
      revokeActivityPhotoPreviews();
      return render({force:true});
    }catch(error){
      console.error('Activity photo batch upload failed:',error);

      if(uploadedPaths.length){
        await bucket.remove(uploadedPaths).catch(cleanupError=>
          console.warn('Gagal membersihkan file foto batch:',cleanupError)
        );
      }

      if(input)input.disabled=false;
      activityPhotoUpload.disabled=false;
      return toast(error?.message||'Upload foto kegiatan gagal. Tidak ada foto dari batch ini yang disimpan.');
    }
    });
  }


  const docUpload=e.target.closest('[data-doc-upload]');
  if(docUpload){
    if(!sb)return toast('Supabase belum tersedia.');

    // Capture the chosen document immediately; do not re-read the input after
    // another queued upload may have caused a render.
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

    const prokerSnapshot=S.detail?.proker ? {...S.detail.proker} : null;
    if(!prokerSnapshot?.organisasi_id)return toast('Organisasi proker tidak ditemukan.');
     if(!['proposal','laporan_akhir'].includes(kind))return toast('Jenis dokumen tidak valid.');
     const ownsProkerContext=S.user.peran==='admin' || (
       S.user.peran!=='wakil_rektor' &&
       String(S.orgId||'')===String(prokerSnapshot.organisasi_id||'') &&
       (S.permissions?.has('proker.create')||S.permissions?.has('proker.edit'))
     );
     if(!ownsProkerContext)return toast('Hanya pengelola organisasi pemilik Proker yang dapat mengunggah dokumen.');
     if(kind==='proposal'&&!['direncanakan','revisi'].includes(prokerSnapshot.status))
       return toast('Proposal hanya dapat diunggah saat Proker direncanakan atau dikembalikan untuk revisi.');
     if(kind==='laporan_akhir'&&prokerSnapshot.status!=='selesai')
       return toast('LPJ hanya dapat diunggah oleh pengelola saat Proker selesai atau dikembalikan untuk perbaikan.');

    return withUploadLock('dokumen',async()=>{
    const proker=prokerSnapshot;
    const quota=await loadStorageStatus(file.size);
    if(quota && !quota.can_upload){
      return toast('Penyimpanan SIMA tidak cukup untuk file ini. Upload dihentikan.');
    }

    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=proker.organisasi_id+'/'+prokerId+'/'+kind+'/'+Date.now()+'_'+safeName;
    const bucket=sb.storage.from('documents');
    try{
      await uploadStorageFile('documents',path,file,{contentType:file.type||'application/octet-stream'});
    }catch(uploadError){
      return toast('Upload dokumen gagal: '+(uploadError?.message||'Tidak dapat mengunggah file.'));
    }

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
    });
  }

  const docPrint=e.target.closest('[data-doc-print]');
  if(docPrint){
    if(!S.detail?.readOnlyCollaborator)return toast('Aksi cetak ini hanya untuk kolaborator.');
    const path=docPrint.dataset.docPrint;
     const doc=(S.detail?.docs||[]).find(x=>x.file_path===path);
     if(!doc||doc.status!=='disetujui')return toast('Hanya dokumen final yang dapat dicetak.');
     if(await openSignedDocument(path))toast('Dokumen final dibuka. Gunakan perintah Cetak pada penampil dokumen.');
     return;
  }

  const docDownload=e.target.closest('[data-doc-download]');
  if(docDownload){
    const path=docDownload.dataset.docDownload;
     await openSignedDocument(path);
     return;
  }

  const workflow=e.target.closest('[data-proker-action]');
  if(workflow){
    if(!sb)return toast('Supabase belum tersedia.');
    const action=workflow.dataset.prokerAction;
    const prokerId=workflow.dataset.prokerId||S.selectedProkerId;
    if(!prokerId)return toast('Proker tidak ditemukan.');
    const comment=$('#workflow-comment')?.value?.trim()||null;
    if(['revise','reject_lpj'].includes(action) && !comment){
      const commentEl=$('#workflow-comment');
      commentEl?.focus();
      return toast('Komentar wajib diisi untuk tindakan revisi.');
    }
    const approvedBudgetEl=$('#approved-budget');
    const approvedBudget=(approvedBudgetEl && S.detail?.proker?.sumber_dana_kode==='KAMPUS') ? parseMoney(approvedBudgetEl.value) : null;
    let data,error;
    const targetProker=S.detail?.proker||S.proker.find(x=>String(x.id)===String(prokerId))||{id:prokerId};
    const rpc=await transitionWorkflow(targetProker,action,comment,approvedBudget);
    data=rpc.data;
    error=rpc.error;
    if(error)return toast('Tindakan gagal: '+(error.message||error.details||error.hint||'Tidak dapat memproses alur proker.'));
    if(data?.status)toast('Status proker diperbarui menjadi: '+(ST[data.status]?.[0]||data.status));

    // A reviewer may lose access to the detail immediately after a workflow
    // decision because the Proker moves to another stage. Do not re-query the
    // now-inaccessible detail page; return to the review/list view instead.
    const reviewActions=['approve','revise','approve_lpj','reject_lpj','forward','return_to_org','send_kaprodi','send_dekan','send_wakil_rektor','review_forward'];
    if(reviewActions.includes(action)){
      S.selectedProkerId=null;
      S.detail=null;
      S.view='proker';
      S.tab='semua';
    }else{
      S.selectedProkerId=prokerId;
    }

    clearViewCache();
    return render();
  }

  const act=e.target.closest('[data-act]');
  if(act){
    if(!sb)return toast('Supabase belum tersedia.');
    const action=act.dataset.act==='revisi'?'revise':act.dataset.act==='setuju'?'approve':act.dataset.act;
    const k=($('#kk')?.value||'').trim()||null;
    const prokerId=S.selectedProkerId;
    if(!prokerId)return toast('Proker tidak ditemukan.');
    const targetProker=S.detail?.proker||S.proker.find(x=>String(x.id)===String(prokerId))||{id:prokerId};
    const {data,error}=await transitionWorkflow(targetProker,action,k,null);
    if(error)return toast('Review gagal: '+(error.message||'Tidak dapat memproses review.'));
    toast('Review tersimpan.');
    clearViewCache();return render();
  }
});
