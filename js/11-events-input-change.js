/* SIMA MHS: focus, input, select-change, and secondary click handlers. */

document.addEventListener('focusin', e => {
  if(e.target.matches('[data-money]')){
    const value=parseMoney(e.target.value);
    e.target.value=value ? formatMoney(value) : '';
    requestAnimationFrame(()=>{try{e.target.setSelectionRange(e.target.value.length,e.target.value.length);}catch(_){}});
  }
});

document.addEventListener('focusout', e => {
  if(e.target.matches('[data-money]')){
    const value=parseMoney(e.target.value);
    e.target.value=value ? formatMoney(value) : 'Rp 0';
  }
});

document.addEventListener('input', e => {
  if(e.target.id==='dekan-hmj-q'){S.dekanDirectoryHmjQ=e.target.value;refreshDekanDirectoryResults();}
  if(e.target.id==='dekan-member-q'){S.dekanDirectoryMemberQ=e.target.value;refreshDekanDirectoryResults();}
  if(e.target.id==='q'){
    S.q=e.target.value;
    clearHtmlCache();
    clearTimeout(S.searchTimer);
    S.searchTimer=setTimeout(()=>render(),220);
  }
  if(e.target.id==='anggota-q'){
    S.anggotaQ=e.target.value;
    clearHtmlCache();
    clearTimeout(S.searchTimer);
    S.searchTimer=setTimeout(()=>render(),180);
  }
  if(e.target.matches('[data-money]')){
    syncMoneyInput(e.target);
    const max=Number(e.target.dataset.moneyMax||0);
    if(max>0 && parseMoney(e.target.value)>max){
      e.target.value=formatMoney(max);
    }
  }
  if(e.target.closest('#kb') || e.target.id==='f-anggaran')hitung();
});

document.addEventListener('change', async e => {
  if(e.target.id==='dekan-hmj-filter'){S.dekanDirectoryHmjId=e.target.value||'';refreshDekanDirectoryResults();return;}
  if(e.target.id==='activity-photo-input'){
    renderActivityPhotoSelection(e.target.files);
    return;
  }

  if(e.target.id==='f-sumber'){
    const source=(S.sources||[]).find(x=>x.kode===e.target.value);
    const detailWrap=$('#f-sumber-detail-wrap');
    const detailInput=$('#f-sumber-detail');
    const note=$('#f-sumber-note');
    if(detailWrap)detailWrap.classList.toggle('hidden',!source?.wajib_rincian);
    if(detailInput)detailInput.required=!!source?.wajib_rincian;
    if(note)note.textContent=source?.hitung_plafon
      ? 'Sumber Kampus: nominal diajukan ke Wakil Rektor dan akan mengurangi plafon sesuai nominal yang disetujui.'
      : source?.kode==='TANPA_DANA'
        ? 'Tanpa dana: total anggaran harus Rp 0 dan tidak mengurangi plafon kampus.'
        : 'Sumber dana ini tidak mengurangi plafon kampus.';
    if(source?.kode==='TANPA_DANA'){
      const money=$('#f-anggaran'); if(money)money.value='Rp 0';
      syncMoneyInput(money);
    }
  }

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

  if(e.target.id==='anggota-period'){
    S.anggotaPeriodId=e.target.value||null;
    await loadAnggota();
    clearHtmlCache();
    return render();
  }

  if(e.target.id==='struktur-org'){
    S.structureOrgId=e.target.value||null;
    await Promise.all([loadStructure(),loadUnits(),loadJabatanAndUnits()]);
    return render();
  }

  if(e.target.id==='cx'){
    const seq=++S.contextSwitchSeq;
    const nextCtx=Number(e.target.value);
    const nextOrgId=S.ctxs[nextCtx]?.orgId||null;

    S.ctx=nextCtx;
    S.orgId=nextOrgId;
    S.selectedProkerId=null;
    // Invalidate any render/data request still running for the previous context.
    S.renderToken++;
    clearViewCache();
    if(S.view==='review')S.view='proker';

    if(S.contextSwitchTimer)clearTimeout(S.contextSwitchTimer);

    await new Promise(resolve=>{
      S.contextSwitchTimer=setTimeout(resolve,180);
    });

    if(seq!==S.contextSwitchSeq)return;

    await loadPermissionsForOrganization(nextOrgId);

    if(seq!==S.contextSwitchSeq)return;
    return render({force:true});
  }
  if(e.target.id==='an-peran'){
    syncSpecialAccountRole();
    return;
  }

  if(e.target.id==='an-org'){
    if(isReviewerAccountRole($('#an-peran')?.value||'')){
      syncSpecialAccountRole();
      return;
    }
  }

  if(e.target.id==='p-akun'){
    syncAdditionalAssignment();
    return;
  }

  if(e.target.id==='p-org' && (S.accounts||[]).find(x=>String(x.id)===String($('#p-akun')?.value||''))?.peran==='pembimbing'){
    syncAdditionalAssignment();
    return;
  }

  if(['an-org','an-jabatan','p-org','p-jabatan'].includes(e.target.id)){
    const prefix=e.target.id.startsWith('p-')?'p':'an';
    if(prefix==='an' && ['pembimbing','wakil_rektor','staf_keuangan','kaprodi','dekan'].includes($('#an-peran')?.value)){
      syncSpecialAccountRole();
      return;
    }
    if(prefix==='p' && isReviewerAccountRole((S.accounts||[]).find(x=>String(x.id)===String($('#p-akun')?.value||''))?.peran||'')){
      syncAdditionalAssignment();
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
  if(e.target.closest('[data-mobile-more]')){openMobileMoreMenu();return;}
  if(!e.target.closest('#notifWrap'))$('#notifPanel').hidden=true;
  if(!e.target.closest('#profileWrap'))$('#profileMenu').hidden=true;
});
