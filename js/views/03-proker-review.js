/* Page renderer: Proker detail, workflow timeline, documents, and review controls. */

V.review = function(){
    const d=S.detail;
    if(!d?.proker)return emptyCard('Detail proker tidak ditemukan.','<button class="btn" data-go="proker">Kembali</button>');
    const p=d.proker;
    const proposal=d.docs.find(x=>x.jenis==='proposal');
    const lpj=d.docs.find(x=>['laporan_akhir','lpj'].includes(x.jenis));
    const isBemReviewerForStage=
      ['bem','bem_from_wakil_rektor','bem_lpj'].includes(p.review_stage) &&
      p.organisasi?.tipe==='HMJ' &&
      String(p.organisasi?.induk_organisasi_id||'')===String(S.orgId||'') &&
      S.permissions?.has(p.review_stage==='bem_lpj'?'laporan.review':'dokumen.review');

    const isPembimbingReviewerForStage=
      S.user.peran==='pembimbing' &&
      ['pembimbing_hmj','pembimbing_hmj_lpj'].includes(p.review_stage) &&
      S.permissions?.has('dokumen.review');

    const isWakilReviewerForStage=S.user.peran==='wakil_rektor'&&NEW_WR_STAGES.has(p.review_stage);
    const isNewReviewerForStage=isNewWorkflowReviewer(p);
    const isUkmStageReviewerFor = isUkmStageReviewer(p);
    const isStageReviewer=
      isUkmStageReviewerFor ||
      isBemReviewerForStage ||
      isPembimbingReviewerForStage ||
      isWakilReviewerForStage;

    // A Wakil Rektor is never downgraded to collaborator/read-only mode while
    // the workflow is explicitly routed to the Wakil Rektor.
    const readOnlyAssignedCoordinator=!!d.readOnlyAssignedCoordinator||p.__coordinatorReadOnly===true;
    const readOnlyDekanFollowup=!!d.readOnlyDekanFollowup||p.__dekanReadOnly===true;
    const readOnlyCollaborator=(!!d.readOnlyCollaborator&&!isStageReviewer)||readOnlyAssignedCoordinator;

    const wakilReadOnly=
      S.user.peran==='wakil_rektor' &&
      !isWakilReviewerForStage;
    const canEdit=!readOnlyCollaborator&&!readOnlyDekanFollowup && S.user.peran!=='wakil_rektor' && S.permissions?.has('proker.edit');
    const canCreate=!readOnlyCollaborator&&!readOnlyDekanFollowup && S.user.peran!=='wakil_rektor' && S.permissions?.has('proker.create');
    // Review permission is not upload permission: only the owning organization may manage files.
    const canManageProkerDocuments=!readOnlyCollaborator&&!readOnlyDekanFollowup && S.user.peran!=='wakil_rektor' && (
      S.user.peran==='admin' ||
      (String(S.orgId||'')===String(p.organisasi_id||'') &&
       (S.permissions?.has('proker.create')||S.permissions?.has('proker.edit')))
    );
    const canReviewLegacy=!readOnlyCollaborator&&!readOnlyDekanFollowup && !wakilReadOnly && (S.permissions?.has('dokumen.review')||S.permissions?.has('laporan.review'));
    const canReviewStage=
      isUkmStageReviewerFor ||
      isWakilReviewerForStage ||
      (!readOnlyCollaborator && (
        (['pembimbing_hmj','pembimbing_hmj_lpj'].includes(p.review_stage) &&
          S.user.peran==='pembimbing' &&
          S.permissions?.has(p.review_stage==='pembimbing_hmj_lpj'?'laporan.review':'dokumen.review'))
        || (['bem','bem_from_wakil_rektor','bem_lpj'].includes(p.review_stage) &&
          S.user.peran!=='wakil_rektor' &&
          p.organisasi?.tipe==='HMJ' &&
          S.permissions?.has(p.review_stage==='bem_lpj'?'laporan.review':'dokumen.review'))
        || (!p.review_stage && canReviewLegacy)
      ));
    const canReview=canReviewLegacy||canReviewStage;
    const isProposalStage=['pembimbing_hmj','bem','bem_from_wakil_rektor','wakil_rektor','ukm_koordinator','ukm_presiden_bem',
      'koordinator_hmj','koordinator_ukm','presiden_bem_hmj','presiden_bem_ukm','kaprodi_hmj','dekan_hmj',
      'wakil_rektor_hmj','wakil_rektor_ukm'].includes(p.review_stage);
    const isLpjStage=['pembimbing_hmj_lpj','bem_lpj','wakil_rektor_lpj','ukm_koordinator_lpj','ukm_presiden_bem_lpj',
      'koordinator_hmj_lpj','koordinator_ukm_lpj','presiden_bem_hmj_lpj','presiden_bem_ukm_lpj',
      'kaprodi_hmj_lpj','dekan_hmj_lpj','wakil_rektor_hmj_lpj','wakil_rektor_ukm_lpj'].includes(p.review_stage);
    // Reviewer visibility is determined by workflow stage. The backend RPC
    // remains authoritative for self-review and authorization checks.
    const isWakilProposalReview=
      isWakilReviewerForStage &&
      p.status==='proposal_diajukan' &&
      NEW_WR_STAGES.has(p.review_stage) &&
      !String(p.review_stage).endsWith('_lpj') &&
      !!proposal;

    const isProposalReview=
      isWakilProposalReview ||
      (p.status==='proposal_diajukan' &&
       !!proposal &&
       isProposalStage &&
       canReviewStage &&
       S.user.peran!=='wakil_rektor' &&
       String(p.dibuat_oleh||'')!==String(S.user.id||''));

    // LPJ has a final campus-level reviewer too. Do not reuse the old
    // owner/self-review exclusion for the active Wakil Rektor stage.
    const isWakilLpjReview=
      isWakilReviewerForStage &&
      p.status==='lpj_diajukan' &&
      NEW_WR_STAGES.has(p.review_stage) &&
      String(p.review_stage).endsWith('_lpj') &&
      !!lpj;

    const isLpjReview=
      isWakilLpjReview ||
      (p.status==='lpj_diajukan' &&
       !!lpj &&
       isLpjStage &&
       canReviewStage &&
       S.user.peran!=='wakil_rektor' &&
       String(p.dibuat_oleh||'')!==String(S.user.id||''));
    const pendingCollaborators=(d.kolaborator||[]).filter(x=>x.status!=='bergabung');
    const confirmedCollaborators=(d.kolaborator||[]).filter(x=>x.status==='bergabung');
    const collabReady=pendingCollaborators.length===0;
    const blockedAction=(label)=>'<button type="button" class="btn opacity-50 cursor-not-allowed" disabled>'+label+'</button>';
    const collabGate=!collabReady
      ? '<div class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><b>Proker belum dapat dilanjutkan.</b> '+confirmedCollaborators.length+' dari '+(d.kolaborator||[]).length+' kolaborator sudah mengonfirmasi. Menunggu: '+esc(pendingCollaborators.map(x=>{const o=(S.organizations||[]).find(org=>String(org.id)===String(x.organisasi_id));return o?.nama||'Organisasi kolaborator';}).join(', '))+'</div>'
      : '';
    const action=(action,label,kind='')=>'<button class="btn '+kind+'" data-proker-action="'+action+'" data-proker-id="'+esc(p.id)+'">'+label+'</button>';
    let actions='';

    if(isNewWorkflowCoordinator(p)&&p.status==='proposal_diajukan'&&['koordinator_hmj_revisi','koordinator_ukm_revisi'].includes(p.review_stage))
      actions=action('return_to_org',p.review_stage==='koordinator_hmj_revisi'?'Kembalikan revisi ke HMJ':'Kembalikan revisi ke UKM Minat Bakat');
    else if(isNewWorkflowCoordinator(p)&&p.status==='lpj_diajukan'&&['koordinator_hmj_lpj_revisi','koordinator_ukm_lpj_revisi'].includes(p.review_stage))
      actions=action('return_to_org',p.review_stage==='koordinator_hmj_lpj_revisi'?'Kembalikan revisi LPJ ke HMJ':'Kembalikan revisi LPJ ke UKM Minat Bakat');
    else if(isNewWorkflowCoordinator(p)&&p.status==='proposal_diajukan'&&['koordinator_hmj','koordinator_ukm'].includes(p.review_stage))
      actions=!collabReady?collabGate+blockedAction('Menunggu konfirmasi kolaborator'):action('forward','Teruskan ke Presiden BEM');
    else if(isNewWorkflowCoordinator(p)&&p.status==='lpj_diajukan'&&['koordinator_hmj_lpj','koordinator_ukm_lpj'].includes(p.review_stage))
      actions=!collabReady?collabGate+blockedAction('Menunggu konfirmasi kolaborator'):action('forward','Teruskan LPJ ke Presiden BEM');
    else if(isNewWorkflowOwnerForwardStage(p)&&p.status==='proposal_diajukan'){
      const next=p.review_stage==='hmj_lanjut_kaprodi'?['send_kaprodi','Ajukan ke Kaprodi']:p.review_stage==='hmj_lanjut_dekan'?['send_dekan','Ajukan ke Dekan untuk review']:['send_wakil_rektor','Ajukan ke Wakil Rektor 1'];
      actions=!collabReady?collabGate+blockedAction('Menunggu konfirmasi kolaborator'):(proposal?.file_path?action(next[0],next[1]):'<p class="sub">Pastikan proposal sudah diunggah.</p>');
    }
    else if(isNewWorkflowOwnerForwardStage(p)&&p.status==='lpj_diajukan'){
      const next=p.review_stage==='hmj_lanjut_kaprodi_lpj'?['send_kaprodi','Ajukan LPJ ke Kaprodi']:p.review_stage==='hmj_lanjut_dekan_lpj'?['send_dekan','Ajukan LPJ ke Dekan untuk review']:['send_wakil_rektor','Ajukan LPJ ke Wakil Rektor 1'];
      actions=!collabReady?collabGate+blockedAction('Menunggu konfirmasi kolaborator'):(lpj?.file_path?action(next[0],next[1]):'<p class="sub">Pastikan LPJ sudah diunggah.</p>');
    }
    else if(isNewWorkflowKaprodi(p)&&p.status==='proposal_diajukan'&&p.review_stage==='kaprodi_hmj'&&isProposalReview){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : '<div class="w-full"><p class="text-sm text-slate-600 mb-3">Kaprodi meninjau proposal HMJ. Jika disetujui, proker kembali ke HMJ untuk diteruskan ke Dekan Fakultas.</p><label>Komentar review <span class="text-xs text-slate-500">(wajib jika revisi)</span></label><textarea id="workflow-comment" rows="3" placeholder="Isi alasan revisi jika proposal perlu diperbaiki."></textarea><div class="flex flex-wrap gap-2 mt-3">'+action('revise','Kembalikan ke HMJ untuk revisi','d')+action('approve','Setujui proposal')+'</div></div>';
    }
    else if(isNewWorkflowKaprodi(p)&&p.status==='lpj_diajukan'&&p.review_stage==='kaprodi_hmj_lpj'&&isLpjReview){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : '<div class="w-full"><p class="text-sm text-slate-600 mb-3">Kaprodi meninjau LPJ HMJ. Jika disetujui, LPJ kembali ke HMJ untuk diteruskan ke Dekan Fakultas.</p><label>Komentar review <span class="text-xs text-slate-500">(wajib jika dikembalikan)</span></label><textarea id="workflow-comment" rows="3" placeholder="Isi alasan jika LPJ perlu diperbaiki."></textarea><div class="flex flex-wrap gap-2 mt-3">'+action('reject_lpj','Kembalikan LPJ untuk perbaikan','d')+action('approve_lpj','Setujui LPJ')+'</div></div>';
    }
    else if(isNewWorkflowDekan(p)&&p.status==='proposal_diajukan'){
      actions='<p class="text-sm bg-slate-50 rounded-xl p-3">Dekan hanya mereview kegiatan dan tidak memberi keputusan ACC/revisi.</p><label>Komentar review (opsional)</label><textarea id="workflow-comment" rows="3"></textarea><div class="mt-3">'+action('review_forward','Selesai review · teruskan ke Wakil Rektor 1')+'</div>';
    }
    else if(isNewWorkflowDekan(p)&&p.status==='lpj_diajukan'){
      actions='<p class="text-sm bg-slate-50 rounded-xl p-3">Dekan hanya mereview LPJ untuk informasi fakultas.</p><label>Komentar review (opsional)</label><textarea id="workflow-comment" rows="3"></textarea><div class="mt-3">'+action('review_forward','Selesai review LPJ · teruskan ke Wakil Rektor 1')+'</div>';
    }
    else if(isWakilProposalReview){
      const targetLabel=reviewStageLabel(p.review_stage,p.organisasi?.tipe);
      actions='<div class="w-full">'+
        '<div class="rounded-xl border border-sima-100 bg-sima-50 p-3 mb-3">'+
          '<p class="text-sm font-semibold text-sima-800">Pengajuan sudah sampai di Wakil Rektor.</p>'+
          '<p class="text-xs text-sima-700 mt-1">Ini adalah tahap tindakan aktif. Wakil Rektor dapat menyetujui atau mengembalikan untuk revisi.</p>'+
        '</div>'+
        '<p class="text-sm text-slate-600 mb-3">Tahap saat ini: <b>'+esc(targetLabel||'Wakil Rektor')+'</b></p>'+
        ((p.sumber_dana_kode==='KAMPUS')
          ? '<label>Anggaran kampus disetujui Wakil Rektor</label><input id="approved-budget" type="text" inputmode="numeric" autocomplete="off" data-money="amount" data-money-max="'+esc(p.anggaran_diajukan||0)+'" value="'+esc(formatMoney(p.anggaran_diajukan||0))+'"><p class="sub">Diajukan ke kampus: <b>'+rp(p.anggaran_diajukan||0)+'</b> · Sisa plafon periode: <b>'+rp(d.budgetStatus?.tersisa||0)+'</b></p>'
          : (p.sumber_dana_kode
            ? '<p class="mt-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">Sumber dana: '+esc((S.sources||[]).find(x=>x.kode===p.sumber_dana_kode)?.nama||p.sumber_dana_kode)+' · Dana ini tidak mengurangi plafon kampus.</p>'
            : ''))+
        '<label class="mt-3">Komentar review</label>'+
        '<textarea id="workflow-comment" rows="3" placeholder="Komentar untuk pengaju, terutama wajib saat revisi."></textarea>'+
        '<div class="flex flex-wrap gap-2 mt-3">'+
          action('revise','Kembalikan untuk revisi','d')+
          action('approve',p.sumber_dana_kode==='KAMPUS'?'ACC & setujui anggaran':'ACC proposal')+
        '</div>'+
      '</div>';
    }
    else if(p.status==='proposal_diajukan' && p.review_stage==='hmj_from_pembimbing_approved' && (canCreate||canEdit)){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : action('forward_hmj_to_bem','Teruskan ke BEM');
    }
    else if(p.status==='lpj_diajukan' && ['hmj_from_pembimbing_lpj'].includes(p.review_stage) && (canCreate||canEdit)){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : action('forward_lpj_to_bem','Teruskan LPJ ke BEM');
    }
    else if(p.status==='direncanakan'&&(canCreate||canEdit)){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : (proposal?.file_path ? action('submit','Ajukan proposal') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload proposal terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>');
    }
    else if(p.status==='revisi' && p.review_stage==='hmj_from_wakil_rektor_lpj' && (canCreate||canEdit)){
      if(!collabReady) actions=collabGate+blockedAction('Menunggu konfirmasi kolaborator');
      else if(lpj?.file_path){
        actions='<div class="w-full"><p class="text-sm bg-amber-50 text-amber-800 rounded-xl p-3">Revisi dari Wakil Rektor. Perbaiki LPJ lalu ajukan kembali ke Pembimbing HMJ.</p><div class="flex flex-wrap gap-2 mt-3">'+action('submit_lpj','Ajukan ulang LPJ ke Pembimbing')+'</div></div>';
      }else{
        actions='<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang LPJ yang sudah diperbaiki terlebih dahulu.</p>';
      }
    }
    else if(p.status==='revisi'&&(canCreate||canEdit)){
      if(!collabReady) actions=collabGate+blockedAction('Menunggu konfirmasi kolaborator');
      else if(p.organisasi?.tipe==='HMJ' && p.review_stage==='hmj_from_bem'){
        actions=proposal?.file_path
          ? '<div class="w-full"><p class="text-sm bg-amber-50 text-amber-800 rounded-xl p-3">Revisi dari BEM. HMJ dapat konsultasi ulang ke Pembimbing atau langsung melewati Pembimbing.</p><div class="flex flex-wrap gap-2 mt-3">'+action('resubmit_hmj_consult','Konsultasikan ke Pembimbing')+action('resubmit_hmj_skip','Lewati Pembimbing')+'</div></div>'
          : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }else if(p.organisasi?.tipe==='HMJ' && p.review_stage==='hmj_from_pembimbing'){
        actions=proposal?.file_path ? action('resubmit','Ajukan ulang ke Pembimbing') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }else if(p.review_stage==='bem_from_wakil_rektor' && p.organisasi?.tipe==='HMJ' && S.user.peran!=='wakil_rektor'){
        actions=proposal?.file_path
          ? '<div class="w-full"><p class="text-sm bg-amber-50 text-amber-800 rounded-xl p-3">Revisi dari Wakil Rektor. BEM dapat mengirim kembali ke Wakil Rektor atau mengembalikan ke HMJ untuk perbaikan.</p>'+
            '<label class="mt-3">Komentar revisi <span class="text-red-600">*</span></label>'+
            '<textarea id="workflow-comment" rows="3" placeholder="Jelaskan bagian yang perlu diperbaiki sebelum dikembalikan ke HMJ."></textarea>'+
            '<p class="text-xs text-slate-500 mt-1">Komentar wajib diisi jika memilih "Kembalikan ke HMJ".</p>'+
            '<div class="flex flex-wrap gap-2 mt-3">'+action('resubmit','Kirim kembali ke Wakil Rektor')+action('revise','Kembalikan ke HMJ','d')+'</div></div>'
          : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }else if(p.organisasi?.tipe==='UKM'){
        actions=proposal?.file_path ? action('resubmit','Ajukan ulang ke Koordinator UKM') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }else if(p.organisasi?.tipe==='BEM' && p.review_stage==='bem_from_wakil_rektor'){
        actions=proposal?.file_path ? action('resubmit','Ajukan kembali ke Wakil Rektor') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }else{
        actions=proposal?.file_path ? action('resubmit','Ajukan ulang') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang proposal yang sudah diperbaiki terlebih dahulu.</p>';
      }
    }
    else if(p.status==='disetujui'&&canEdit) actions=!collabReady ? collabGate+blockedAction('Menunggu konfirmasi kolaborator') : action('start','Mulai pelaksanaan');
    else if(p.status==='berjalan'&&canEdit) actions=!collabReady ? collabGate+blockedAction('Menunggu konfirmasi kolaborator') : action('finish','Tandai selesai');
    else if(p.status==='selesai' && p.review_stage==='hmj_from_bem_lpj' && (canCreate||canEdit)){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : (lpj?.file_path
          ? action('forward_lpj_to_bem','Kirim kembali LPJ ke BEM')
          : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang LPJ terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>');
    }
    else if(p.status==='selesai' && ['hmj_from_pembimbing_lpj_revision','hmj_from_wakil_rektor_lpj'].includes(p.review_stage) && (canCreate||canEdit)){
      actions=!collabReady
        ? collabGate+blockedAction('Menunggu konfirmasi kolaborator')
        : (lpj?.file_path
          ? action('submit_lpj','Ajukan ulang LPJ ke Pembimbing')
          : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload ulang LPJ terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>');
    }
    else if(p.status==='selesai'&&canEdit) actions=!collabReady ? collabGate+blockedAction('Menunggu konfirmasi kolaborator') : (lpj?.file_path ? action('submit_lpj','Ajukan LPJ') : '<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Upload LPJ terlebih dahulu. Setelah file tersedia, tombol pengajuan akan muncul.</p>');
    else if(isProposalReview){
      const targetLabel=reviewStageLabel(p.review_stage,p.organisasi?.tipe);
      actions='<div class="w-full"><p class="text-sm text-slate-600 mb-3">Tahap saat ini: <b>'+esc(targetLabel||'Review internal')+'</b></p><label>Komentar review</label>'+
        ((S.user.peran==='wakil_rektor'&&['BEM','HMJ','UKM'].includes(p.organisasi?.tipe)&&p.review_stage==='wakil_rektor'&&p.sumber_dana_kode==='KAMPUS')?
          '<label class="mt-3">Anggaran kampus disetujui Wakil Rektor</label><input id="approved-budget" type="text" inputmode="numeric" autocomplete="off" data-money="amount" data-money-max="'+esc(p.anggaran_diajukan||0)+'" value="'+esc(formatMoney(p.anggaran_diajukan||0))+'"><p class="sub">Diajukan ke kampus: <b>'+rp(p.anggaran_diajukan||0)+'</b> · Sisa plafon periode: <b>'+rp(d.budgetStatus?.tersisa||0)+'</b></p>'
          :((p.sumber_dana_kode&&p.sumber_dana_kode!=='KAMPUS')?'<p class="mt-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">Sumber dana: '+esc((S.sources||[]).find(x=>x.kode===p.sumber_dana_kode)?.nama||p.sumber_dana_kode||'-')+'. Dana ini <b>tidak mengurangi plafon kampus</b>.</p>':'') )+
        '<textarea id="workflow-comment" rows="3" placeholder="Komentar untuk pengaju, terutama wajib saat revisi."></textarea><div class="flex flex-wrap gap-2 mt-3">'+
          action('revise',
            ['presiden_bem_hmj','presiden_bem_ukm'].includes(p.review_stage)
              ? 'Kembalikan ke Koordinator BEM'
              : ['ukm_koordinator','ukm_presiden_bem','wakil_rektor','wakil_rektor_ukm','wakil_rektor_hmj'].includes(p.review_stage)
                ? 'Kembalikan untuk revisi'
                : ['kaprodi_hmj','kaprodi_hmj_lpj'].includes(p.review_stage)
                  ? 'Kembalikan ke HMJ'
                  : p.review_stage==='pembimbing_hmj'
                    ? 'Kembalikan untuk revisi'
                    : p.review_stage==='bem'
                      ? 'Kembalikan ke HMJ'
                      : 'Kembalikan untuk revisi',
            'd')+
          action('approve',
            ['ukm_koordinator','koordinator_hmj','koordinator_ukm'].includes(p.review_stage)
              ? 'Setujui & teruskan ke Presiden BEM'
              : ['ukm_presiden_bem','presiden_bem_ukm'].includes(p.review_stage)
                ? 'ACC & teruskan ke Wakil Rektor 1'
                : p.review_stage==='presiden_bem_hmj'
                  ? 'ACC & lanjut ke HMJ untuk pengajuan Kaprodi'
                  : p.review_stage==='kaprodi_hmj'
                    ? 'ACC & lanjut ke HMJ untuk pengajuan Dekan'
                    : NEW_WR_STAGES.has(p.review_stage)
                      ? (p.sumber_dana_kode==='KAMPUS'?'ACC & setujui anggaran':'ACC proposal')
                      : p.review_stage==='pembimbing_hmj'
                        ? 'Setujui & kembalikan ke HMJ'
                        : p.review_stage==='bem'
                          ? 'Setujui & teruskan ke Wakil Rektor 1'
                          : 'Setujui',
            '')+
        '</div></div>';
    }
    else if(isLpjReview) actions='<div class="w-full"><label>Komentar review LPJ'+(['ukm_koordinator_lpj','ukm_presiden_bem_lpj','presiden_bem_ukm_lpj','presiden_bem_hmj_lpj','kaprodi_hmj_lpj','wakil_rektor_lpj','wakil_rektor_ukm_lpj','wakil_rektor_hmj_lpj'].includes(p.review_stage)?' (wajib saat revisi)':'')+'</label><textarea id="workflow-comment" rows="3" placeholder="Catatan review LPJ"></textarea><div class="flex flex-wrap gap-2 mt-3">'+action('reject_lpj',['presiden_bem_ukm_lpj','presiden_bem_hmj_lpj'].includes(p.review_stage)?'Kembalikan ke Koordinator BEM':'Kembalikan untuk revisi','d')+action('approve_lpj',['ukm_koordinator_lpj','koordinator_hmj_lpj','koordinator_ukm_lpj'].includes(p.review_stage)?'Setujui & teruskan ke Presiden BEM':['ukm_presiden_bem_lpj','presiden_bem_ukm_lpj'].includes(p.review_stage)?'ACC & teruskan ke Wakil Rektor 1':p.review_stage==='presiden_bem_hmj_lpj'?'ACC & lanjut ke HMJ untuk pengajuan Kaprodi':p.review_stage==='kaprodi_hmj_lpj'?'ACC & lanjut ke HMJ untuk pengajuan Dekan':NEW_WR_STAGES.has(p.review_stage)?'ACC LPJ':'Setujui LPJ','')+'</div></div>';

    const ukmJourney=isUkmProker(p),hmjJourney=isHmjProker(p);
    const processKind=hmjJourney?'hmj':ukmJourney?'ukm':'bem';
    const steps=processKind==='bem'
      ? [['direncanakan','Direncanakan','calendar'],['wakil_rektor','Review Wakil Rektor 1','file'],['disetujui','Disetujui','check'],['berjalan','Pelaksanaan','calendar'],['selesai','Selesai','check'],['wakil_rektor_lpj','Review LPJ WR1','file'],['lpj_disetujui','LPJ selesai','check']]
      : processKind==='ukm'
        ? [['direncanakan','Direncanakan','calendar'],['koordinator_ukm','Koordinator BEM','file'],['presiden_bem_ukm','Presiden BEM','users'],['wakil_rektor_ukm','Wakil Rektor 1','wallet'],['disetujui','Disetujui','check'],['berjalan','Pelaksanaan','calendar'],['selesai','Selesai','check'],['koordinator_ukm_lpj','Koordinator LPJ','file'],['presiden_bem_ukm_lpj','Presiden BEM','users'],['wakil_rektor_ukm_lpj','Wakil Rektor 1','wallet'],['lpj_disetujui','LPJ selesai','check']]
        : [['direncanakan','Direncanakan','calendar'],['koordinator_hmj','Koordinator BEM','file'],['presiden_bem_hmj','Presiden BEM','users'],['hmj_lanjut_kaprodi','HMJ → Kaprodi','file'],['kaprodi_hmj','Kaprodi','users'],['hmj_lanjut_dekan','HMJ → Dekan Fakultas','file'],['dekan_hmj','Review Dekan Fakultas','eye'],['wakil_rektor_hmj','Wakil Rektor 1','wallet'],['disetujui','Disetujui','check'],['berjalan','Pelaksanaan','calendar'],['selesai','Selesai','check'],['koordinator_hmj_lpj','Koordinator LPJ','file'],['presiden_bem_hmj_lpj','Presiden BEM','users'],['hmj_lanjut_kaprodi_lpj','HMJ → Kaprodi','file'],['kaprodi_hmj_lpj','Kaprodi · review LPJ','users'],['hmj_lanjut_dekan_lpj','HMJ → Dekan Fakultas','file'],['dekan_hmj_lpj','Review Dekan Fakultas','eye'],['wakil_rektor_hmj_lpj','Wakil Rektor 1','wallet'],['lpj_disetujui','LPJ selesai','check']];
    const isReturnedForRevision=p.status==='revisi';
    const rawStepKey=p.review_stage||p.status;
    const isCoordinatorReturningRevision=String(rawStepKey).endsWith('_revisi');
    const currentStepKey=isReturnedForRevision?'direncanakan':isCoordinatorReturningRevision?String(rawStepKey).replace('_revisi',''):rawStepKey;
    const currentIndex=Math.max(steps.findIndex(x=>x[0]===currentStepKey),0);
    const currentStepLabel=isReturnedForRevision?('Revisi · kembali ke '+(hmjJourney?'HMJ':ukmJourney?'UKM Minat Bakat':'BEM')):isCoordinatorReturningRevision?'Revisi · koordinator mengembalikan ke organisasi':(steps[currentIndex]?.[1]||ST[p.status]?.[0]||p.status);
    // Read-only mode remains enforced by permission/action guards; avoid duplicating it with banners.

    return pageHeader(
      p.nama,
      S.user.peran==='wakil_rektor'
        ? (['proposal_diajukan','lpj_diajukan'].includes(p.status)
          ? 'Pengajuan · Wakil Rektor dapat review, setujui, atau revisi.'
          : 'Pemantauan semua organisasi · akses hanya baca.')
        : (readOnlyCollaborator
        ? 'Dokumentasi kolaborator · akses hanya baca.'
        : isStageReviewer
          ? (isUkmProker(p)
            ? 'Pengajuan UKM · setiap tahap dapat disetujui atau dikembalikan ke UKM untuk revisi.'
            : S.user.peran==='pembimbing' ? 'Pengajuan HMJ · Pembimbing dapat review, setujui, atau revisi.'
             : S.user.peran==='wakil_rektor' ? 'Pengajuan · Wakil Rektor dapat review, setujui, atau revisi.'
             : 'Pengajuan HMJ · BEM dapat review, setujui, atau revisi.')
          : 'Alur tindak lanjut program kerja.')+
          (p.review_stage ? ' · Tahap: '+reviewStageLabel(p.review_stage,p.organisasi?.tipe) : ''),
      chip(p.status)
    )+
      '<section class="workflow-steps '+(ukmJourney?'workflow-steps--ukm':'')+'" aria-label="Perjalanan program kerja">'+
        '<div class="workflow-steps-heading"><span class="workflow-steps-title">Perjalanan Proker</span><span class="workflow-current-note '+(isReturnedForRevision?'is-revision':'')+'"><i></i>'+esc(currentStepLabel)+'</span></div>'+
        '<div class="workflow-steps-scroll"><div class="workflow-steps-track '+(ukmJourney?'is-ukm':'')+'">'+steps.map((s,i)=>'<div class="workflow-step-item '+(i<currentIndex?'done':i===currentIndex?'active':'pending')+'" aria-current="'+(i===currentIndex?'step':'false')+'"><span class="workflow-step-icon">'+icon(i<currentIndex?'check':s[2])+'</span><span class="workflow-step-label">'+esc(s[1])+'</span></div>').join('')+'</div></div>'+
      '</section>'+
      '<div class="row2"><div class="card"><h3>Informasi kegiatan</h3><div class="grid grid-cols-2 gap-3 mt-3"><div><small>Organisasi</small><p class="font-semibold">'+esc(p.organisasi?.nama||'-')+'</p></div><div><small>Ketua</small><p class="font-semibold">'+esc(p.ketua_pelaksana||'-')+'</p></div><div><small>Mulai</small><p class="font-semibold">'+dateID(p.tanggal_mulai)+'</p></div><div><small>Selesai</small><p class="font-semibold">'+dateID(p.tanggal_selesai)+'</p></div><div><small>Lokasi</small><p class="font-semibold">'+esc(p.tempat||'-')+'</p></div><div><small>Batas LPJ</small><p class="font-semibold">'+dateID(p.batas_lpj||'Belum aktif')+'</p></div></div><div class="mt-4 grid grid-cols-2 gap-3"><div class="rounded-xl bg-slate-50 p-3"><small>Pengajuan anggaran</small><p class="font-bold">'+rp(p.anggaran_diajukan||0)+'</p></div><div class="rounded-xl bg-emerald-50 p-3"><small>Anggaran disetujui</small><p class="font-bold text-emerald-800">'+rp(p.anggaran_disetujui||0)+'</p></div></div><p class="sub mt-4">'+esc(p.deskripsi||'Tidak ada deskripsi.')+'</p></div>'+
      '<div class="card"><h3>Tindak lanjut</h3><p class="sub">Status saat ini: <b>'+esc(ST[p.status]?.[0]||p.status)+'</b></p>'+
        ((!readOnlyCollaborator&&(canEdit||S.user.peran==='admin')&&['direncanakan','revisi'].includes(p.status))
          ? '<button class="btn s mb-3" data-proker-edit="'+esc(p.id)+'">Edit proker</button>' : '')+
        (actions||((readOnlyCollaborator||readOnlyAssignedCoordinator||readOnlyDekanFollowup)?'':'<p class="sub">Belum ada tindakan yang tersedia untuk akun dan status saat ini.</p>'))+
        (((S.user.peran!=='wakil_rektor')&&(canEdit||S.user.peran==='admin')&&['draft','direncanakan','revisi'].includes(p.status))?
          '<div class="mt-4 pt-4 border-t border-slate-200">'+
            '<button class="btn d" data-proker-delete="'+esc(p.id)+'">Hapus proker secara permanen</button>'+
          '</div>':'')+
      '</div></div>'+
      '<div class="card"><div class="flex items-start justify-between gap-3"><div><h3>Dokumen</h3><p class="sub mb-0">File proposal dan LPJ disimpan di Supabase Storage dan wajib ada sebelum pengajuan.</p></div></div>'+
      (canManageProkerDocuments&&(p.status==='direncanakan'||p.status==='revisi')
        ? '<div class="mt-4 rounded-2xl border border-slate-200 p-4"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">Proposal</p><p class="text-xs text-slate-500">'+(proposal?.file_name?'Sudah diunggah: '+esc(proposal.file_name):'Belum ada file proposal.')+'</p></div><span class="chip '+(proposal?.file_path?'ok':'wa')+'">'+(proposal?.file_path?'Siap diajukan':'Wajib upload')+'</span></div><div class="flex flex-col sm:flex-row gap-2 mt-3"><input id="workflow-file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="flex-1"><button class="btn" data-doc-upload="proposal" data-proker-id="'+esc(p.id)+'">Upload proposal</button>'+(proposal?.file_path?'<button class="btn" data-doc-download="'+esc(proposal.file_path)+'">Lihat file</button><button class="btn d" data-doc-delete="'+esc(proposal.id)+'">Hapus proposal</button>':'')+'</div></div>'
        : '')+
      (canManageProkerDocuments&&p.status==='selesai'
        ? '<div class="mt-4 rounded-2xl border border-slate-200 p-4"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">Laporan akhir / LPJ</p><p class="text-xs text-slate-500">'+(lpj?.file_name?'Sudah diunggah: '+esc(lpj.file_name):'Belum ada file LPJ.')+'</p></div><span class="chip '+(lpj?.file_path?'ok':'wa')+'">'+(lpj?.file_path?'Tersedia':'Wajib upload sebelum pengajuan')+'</span></div><div class="flex flex-col sm:flex-row gap-2 mt-3"><input id="workflow-file-lpj" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="flex-1"><button class="btn" data-doc-upload="laporan_akhir" data-proker-id="'+esc(p.id)+'">Upload LPJ</button>'+(lpj?.file_path?'<button class="btn" data-doc-download="'+esc(lpj.file_path)+'">Lihat file</button><button class="btn d" data-doc-delete="'+esc(lpj.id)+'">Hapus LPJ</button>':'')+'</div></div>'
        : '')+
      (d.docs.length?'<div class="mt-4">'+d.docs.map(doc=>'<div class="py-3 border-b border-slate-100 last:border-0"><div class="flex items-center justify-between gap-3"><div><p class="font-semibold">'+esc(doc.jenis)+'</p><p class="text-xs text-slate-500">'+esc(doc.status||'-')+' · '+esc(doc.tahap||'-')+(doc.file_name?' · '+esc(doc.file_name):'')+'</p></div>'+(doc.file_path?'<button class="btn s" data-doc-download="'+esc(doc.file_path)+'">Buka</button>': '<span class="chip wa">Belum ada file</span>')+
        ((canManageProkerDocuments&&doc.file_path&&(doc.status==='draft'||doc.status==='revisi'))?'<button class="btn d" data-doc-delete="'+esc(doc.id)+'">Hapus</button>':'')+'</div></div>').join('')+'</div>':'<p class="sub mt-4">Belum ada dokumen.</p>')+
      '</div>'+
      ((['selesai','lpj_diajukan','lpj_disetujui'].includes(p.status))
        ? '<div class="card mt-4"><div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h3>Foto kegiatan</h3><p class="sub mb-0">Dokumentasi kegiatan setelah pelaksanaan selesai. Maksimal 5 foto, maksimal 10 MB per foto.</p></div><span class="chip '+(d.photos.length>=5?'wa':'bl')+'">'+d.photos.length+'/5 foto</span></div>'+
          (((!readOnlyCollaborator)&&(canEdit||S.user.peran==='admin')&&d.photos.length<5)
            ? '<div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">'+
  '<div class="flex flex-col lg:flex-row gap-2 lg:items-center"><input id="activity-photo-input" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" class="flex-1"><button class="btn" type="button" disabled data-activity-photo-upload data-proker-id="'+esc(p.id)+'">Upload '+(5-d.photos.length)+' foto sekaligus</button></div>'+
  '<p class="text-xs text-slate-500 mt-2">Pilih hingga '+(5-d.photos.length)+' foto sekaligus. JPG, PNG, WEBP, atau GIF · maksimal 10 MB per foto.</p>'+
  '<p id="activity-photo-selection-status" class="text-xs text-slate-500 mt-2">Belum ada foto dipilih.</p>'+
  '<div id="activity-photo-preview" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3"></div>'+
  '<div id="activity-photo-progress" class="hidden mt-4"><div class="flex items-center justify-between gap-3 mb-1"><span id="activity-photo-progress-text" class="text-xs text-slate-600">Menyiapkan upload...</span><span class="text-xs font-semibold text-slate-600">Batch upload</span></div><div class="h-2 rounded-full bg-slate-200 overflow-hidden"><div id="activity-photo-progress-bar" class="h-full rounded-full bg-sima-600 transition-all duration-200" style="width:0%"></div></div></div>'+
  '</div>'
            : '')+
          (d.photos.length
            ? '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">'+d.photos.map(photo=>
                '<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">'+
                  (photo.thumb_url
                    ? '<img loading="lazy" decoding="async" src="'+esc(photo.thumb_url)+'" alt="'+esc(photo.file_name||'Foto kegiatan')+'" class="w-full h-48 object-cover bg-slate-100">'
                    : '<div class="w-full h-48 bg-slate-100 grid place-items-center text-slate-400 text-sm">Pratinjau tidak tersedia</div>')+
                  '<div class="p-3"><p class="font-semibold text-sm break-words">'+esc(photo.file_name||'Foto kegiatan')+'</p><p class="text-xs text-slate-500 mt-1">'+dateTimeID(photo.uploaded_at||'')+'</p><p class="text-xs text-slate-500">Oleh: '+esc(photo.uploader?.nama||photo.diunggah_oleh||'-')+'</p><p class="text-xs text-sima-700 font-semibold mt-1">Organisasi: '+esc(photo.uploader_organization?.nama||'Tidak terdeteksi')+'</p></div>'+
                '</div>'
              ).join('')+'</div>'
            : '<div class="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center"><p class="sub">Belum ada foto kegiatan.</p></div>')+
          '</div>'
        : '')+
      (d.kolaborator.length
        ? '<div class="row2"><div class="card"><div class="flex items-center justify-between gap-3"><h3>Kolaborator</h3><span class="chip '+(collabReady?'ok':'wa')+'">'+confirmedCollaborators.length+'/'+d.kolaborator.length+' dikonfirmasi</span></div>'+
          d.kolaborator.map(x=>{const o=(S.organizations||[]).find(org=>String(org.id)===String(x.organisasi_id));return '<div class="py-2 border-b border-slate-100 last:border-0"><p class="text-sm font-semibold">'+esc(o?.nama||'Organisasi kolaborator')+'</p><p class="text-xs text-slate-500">'+esc(x.status==='bergabung'?'Sudah bergabung':x.status==='menolak'?'Menolak undangan':'Menunggu konfirmasi')+'</p></div>';}).join('')+
          '</div><div class="card"><h3>Riwayat persetujuan</h3>'
        : '<div class="row2"><div class="card"><h3>Kolaborator</h3><p class="sub">Tidak ada kolaborator.</p></div><div class="card"><h3>Riwayat persetujuan</h3>')+(d.decisionError?'<p class="text-sm text-amber-700 bg-amber-50 rounded-xl p-3">Riwayat tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi.</p>':d.keputusan.length?d.keputusan.map(x=>'<div class="py-2 border-b border-slate-100 last:border-0"><div class="flex flex-wrap items-center gap-2"><p class="font-semibold">'+esc(x.keputusan)+' · '+esc(x.tahap)+'</p>'+(x.dokumen_jenis?'<span class="chip bl">'+esc(x.dokumen_jenis==='laporan_akhir'?'LPJ':'Proposal')+'</span>':'')+'</div><p class="text-xs text-slate-500">'+dateTimeID(x.waktu)+'</p><p class="text-xs text-slate-500">Diproses oleh: '+esc(x.nama_oleh||({koordinator_ukm:'Koordinator UKM',presiden_bem:'Presiden BEM',wakil_rektor:'Wakil Rektor'}[x.sebagai]||x.sebagai||'Reviewer'))+'</p>'+(x.komentar?'<p class="text-sm mt-1">'+esc(x.komentar)+'</p>':'')+'</div>').join(''):'<p class="sub">Belum ada keputusan.</p>')+'</div></div>';
};
