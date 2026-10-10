/* SIMA MHS: form submission handlers and final application initialization. */

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
       // Replace the current tab session exactly once. Avoid duplicate
       // signOut/clear cycles that can race Auth auto-refresh.
       S.intentionalSignOut=true;
       await sb.auth.signOut({ scope:'local' }).catch(()=>{});
       S.intentionalSignOut=false;
       clearLegacyAuthStorage();

       // Authenticate directly through Supabase Auth.
       // The browser talks to the first-party Auth API instead of a custom
       // Edge Function, removing the shared login CORS failure point.
       const {data,error}=await sb.auth.signInWithPassword({email,password});
       if(error||!data?.session?.user){
         console.error('Supabase Auth login failed:',error);
         $('#le').textContent='Email atau kata sandi salah.';
         return;
       }
       S.lastKnownSession=data.session;
       $('#le').textContent='';
       $('#pw').value='';
       await hydrateUser(data.session.user);
    }catch(error){console.error('Login error:',error);$('#le').textContent='Login tidak dapat diproses. Periksa koneksi ke Supabase.';}
    finally{if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Masuk';}}
    return;
  }

  if(e.target.id==='ff'){
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target)), kolab=f.pengajuan==='kolaboratif', errors=[];
    const source=(S.sources||[]).find(x=>x.kode===f.sumber_dana_kode)||null;
    const sourceCode=f.sumber_dana_kode||'KAMPUS';
    const totalAnggaran=parseMoney(f.anggaran_total);
    const orgId=f.organisasi_id||S.orgId;
    if(!orgId)errors.push('Pilih organisasi terlebih dahulu.');
    if(!f.nama)errors.push('Nama program kerja wajib diisi.');
    if(!f.mulai||!f.selesai)errors.push('Tanggal mulai dan selesai wajib diisi.');
    if(f.selesai&&f.mulai&&f.selesai<f.mulai)errors.push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if(!f.tempat)errors.push('Lokasi wajib diisi.');
    const pesertaRows=[...document.querySelectorAll('.peserta')];
    const validPeserta=pesertaRows.filter(row=>row.querySelector('select[data-org-id]')?.value);
    const selectedCollabIds=validPeserta
      .map(row=>row.querySelector('select[data-org-id]')?.value||'')
      .filter(Boolean);

    const duplicateCollab=new Set(selectedCollabIds).size!==selectedCollabIds.length;
    if(duplicateCollab)errors.push('Organisasi kolaborator tidak boleh dipilih lebih dari sekali.');

    const invalidCollab=selectedCollabIds.some(id=>{
      const org=(S.organizations||[]).find(o=>String(o.id)===String(id));
      return !org || !['BEM','UKM','HMJ'].includes(org.tipe) ||
        String(org.id)===String(orgId);
    });
    if(invalidCollab)errors.push('Kolaborator hanya boleh BEM, UKM, atau HMJ lain.');

    if(kolab&&!validPeserta.length)errors.push('Tambahkan minimal satu organisasi kolaborator.');
    if(errors.length){$('#fe').textContent=errors.join(' ');return;}
    const anggaranDiajukan=sourceCode==='KAMPUS'?totalAnggaran:0;
    if(!source)return toast('Pilih sumber dana.');
    if(source.wajib_rincian&&!String(f.sumber_dana_detail||'').trim())errors.push('Detail sumber dana wajib diisi untuk Lain-lain.');
    if(sourceCode==='TANPA_DANA'&&totalAnggaran!==0)errors.push('Proker tanpa dana harus bernilai Rp 0.');
    if(S.editProkerId){
      const target=S.detail?.proker;
      if(!target||String(target.id)!==String(S.editProkerId))return toast('Proker yang diedit tidak ditemukan.');

      const collabRows=[...document.querySelectorAll('#ps .peserta')]
        .map(row=>({
          organisasi_id:row.querySelector('[data-org-id]')?.value||null
        }))
        .filter(x=>x.organisasi_id);

      const ids=collabRows.map(x=>String(x.organisasi_id));
      if(new Set(ids).size!==ids.length){
        return toast('Organisasi kolaborator tidak boleh dipilih lebih dari sekali.');
      }

      const {data,error}=await sb.rpc('update_proker_draft_with_collaborators',{
        p_proker_id:S.editProkerId,
        p_nama:f.nama,
        p_jenis:f.jenis,
        p_tanggal_mulai:f.mulai,
        p_tanggal_selesai:f.selesai,
        p_tempat:f.tempat,
        p_deskripsi:f.deskripsi||'',
        p_sumber_dana_kode:sourceCode,
        p_sumber_dana_detail:String(f.sumber_dana_detail||'').trim()||null,
        p_anggaran_total:totalAnggaran,
        p_collaborators:collabRows
      });
      if(error)return toast('Gagal memperbarui proker dan kolaborator: '+(error.message||'Tidak dapat memperbarui proker.'));

      S.selectedProkerId=target.id;
      S.editProkerId=null;
      clearViewCache();
      await loadProkerDetail();
      toast('Program kerja dan kolaborator berhasil diperbarui.');
      return navigate('review');
    }

    const payload={organisasi_id:orgId,nama:f.nama,jenis:f.jenis,tanggal_mulai:f.mulai,tanggal_selesai:f.selesai,tempat:f.tempat,deskripsi:f.deskripsi||'',pengajuan:f.pengajuan,status:'direncanakan',ketua_pelaksana:S.user.nama,dibuat_oleh:S.user.id,sumber_dana_kode:sourceCode,sumber_dana_detail:source.wajib_rincian?String(f.sumber_dana_detail||'').trim():null,anggaran_total:totalAnggaran,anggaran_diajukan:anggaranDiajukan,anggaran_disetujui:0};
    const {data,error}=await sb.from('proker').insert(payload).select('id').single();
    if(error)return toast('Gagal menyimpan proker: '+error.message);
    if(kolab&&data?.id){
      const collabRows=[...document.querySelectorAll('.peserta')].map(row=>({
        proker_id:data.id,
        organisasi_id:row.querySelector('select[data-org-id]')?.value||null,
        porsi_plafon:0,
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
    const role=$('#an-peran').value;
    const orgId=role==='dekan'?null:($('#an-org').value||null);
    const jabatanKode=role==='dekan'?null:($('#an-jabatan').value||null);
    const unitId=role==='dekan'?null:($('#an-unit').value||null);
    const org=(S.organizations||[]).find(o=>String(o.id)===String(orgId||''));
    const position=(S.positions||[]).find(j=>String(j.kode)===String(jabatanKode||''));
    const unit=(S.units||[]).find(u=>String(u.id)===String(unitId||''));

    // Validate the same organization → position → unit contract that the
    // server enforces. This prevents a stale/mismatched UI state from sending
    // a ministry account through the old "division position" path.
    if(orgId && jabatanKode){
      if(!org)return toast('Organisasi yang dipilih tidak ditemukan. Muat ulang data organisasi.');
      if(!position)return toast('Jabatan yang dipilih tidak ditemukan. Muat ulang data jabatan.');
      if(!Array.isArray(position.berlaku_tipe) || !position.berlaku_tipe.includes(org.tipe)){
        return toast('Jabatan '+(position.nama||jabatanKode)+' tidak berlaku untuk organisasi '+(org.nama||org.tipe)+'.');
      }
      if(position.unit_wajib && !unitId){
        return toast('Jabatan '+(position.nama||jabatanKode)+' membutuhkan unit '+(position.unit_jenis_wajib||'yang sesuai')+'. Pilih unit terlebih dahulu.');
      }
      if(unitId){
        if(!unit)return toast('Unit yang dipilih tidak ditemukan. Muat ulang struktur organisasi.');
        if(String(unit.organisasi_id)!==String(orgId)){
          return toast('Unit yang dipilih bukan milik organisasi tersebut.');
        }
        if(position.unit_jenis_wajib && unit.jenis!==position.unit_jenis_wajib){
          const label=position.unit_jenis_wajib==='kementerian'?'Kementerian':'Divisi';
          return toast('Jabatan '+(position.nama||jabatanKode)+' membutuhkan '+label+'. Unit yang dipilih adalah '+(unit.jenis||'tidak dikenal')+'.');
        }
      }
    }

    const input={
      nama:$('#an-nama').value.trim(),
      email:$('#an-email').value.trim().toLowerCase(),
      nim:['user','mahasiswa'].includes(role)?($('#an-nim').value.trim()||null):null,
      peran:role,
      organisasi_id:orgId,
      jabatan_kode:jabatanKode,
      unit_id:unitId
    };
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
    if(S.user.peran!=='wakil_rektor')return toast('Hanya Wakil Rektor 1 yang boleh mengatur plafon.');
    const periodeId=$('#p-periode').value;
    const jumlah=parseMoney($('#p-jumlah').value);
    if(!periodeId||jumlah<0)return toast('Periode dan jumlah plafon wajib valid.');
    const {error}=await sb.rpc('set_anggaran_periode',{p_periode_id:periodeId,p_plafon:jumlah});
    if(error)return toast('Gagal menyimpan plafon: '+error.message);
    toast('Plafon periode berhasil disimpan.');clearViewCache();return render();
  }

  if(e.target.id==='form-penggunaan'){
    e.preventDefault();
    const proker_id=$('#u-proker').value;
    const jumlah=parseMoney($('#u-jumlah').value);
    const tanggal=$('#u-tanggal').value||new Date().toISOString().slice(0,10);
    const keterangan=$('#u-keterangan').value.trim();
    if(!proker_id||jumlah<=0||!keterangan)return toast('Lengkapi proker, jumlah, dan keterangan.');
    const {error}=await sb.rpc('add_penggunaan_dana',{
      p_proker_id:proker_id,
      p_jumlah:jumlah,
      p_tanggal:tanggal,
      p_keterangan:keterangan
    });
    if(error){
      const msg=String(error.message||'');
      if(msg.includes('USAGE_EXCEEDS_APPROVED_BUDGET'))return toast('Penggunaan melebihi anggaran yang disetujui.');
      if(msg.includes('FORBIDDEN_FUND_USAGE'))return toast('Kamu tidak memiliki akses ke penggunaan dana organisasi ini.');
      return toast('Gagal mencatat penggunaan: '+msg);
    }
    toast('Penggunaan dana tersimpan.');
    clearViewCache();
    return render();
  }

  if(e.target.id==='form-organisasi'){
    e.preventDefault();
    const nama=$('#o-nama').value.trim();
    const tipe=$('#o-tipe').value;
    const periode_id=$('#o-periode').value;
    const induk_organisasi_id=(tipe==='HMJ'||tipe==='UKM'||tipe==='CLUB')?($('#o-parent').value||null):null;
    const relasi=[...($('#o-relasi')?.selectedOptions||[])].map(x=>x.value);
    if(!nama)return toast('Nama organisasi wajib diisi.');
    if(!periode_id)return toast('Pilih periode terlebih dahulu.');
    if((tipe==='HMJ'||tipe==='UKM'||tipe==='CLUB')&&!induk_organisasi_id)return toast('Pilih BEM sebagai induk organisasi.');
    if(tipe==='BEM'&&induk_organisasi_id)return toast('BEM tidak boleh memiliki induk.');
    const {data,error}=await sb.from('organisasi').insert({nama,tipe,periode_id,induk_organisasi_id}).select('id').single();
    if(error)return toast('Gagal membuat organisasi: '+error.message);
    if(tipe==='CLUB'&&relasi.length){
      const rows=relasi.filter(id=>id!==data.id).map(id=>({organisasi_id:data.id,terhubung_dengan_id:id,hubungan:'terhubung',dibuat_oleh:S.user.id}));
      const r=await sb.from('organisasi_relasi').insert(rows);
      if(r.error)return toast('Organisasi dibuat, tetapi koneksi UKM Minat Bakat gagal: '+r.error.message);
    }
    toast('Organisasi berhasil ditambahkan.');return render();
  }

  if(e.target.id==='form-club-relasi'){
    e.preventDefault();
    if(!S.orgId)return toast('Pilih UKM Minat Bakat terlebih dahulu.');
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
    if(error)return toast('Gagal menambah anggota UKM Minat Bakat: '+error.message);
    toast('Anggota UKM Minat Bakat ditambahkan tanpa akun.');return render();
  }

  if(e.target.matches('form[data-koordinator-form]')){
    e.preventDefault();
    const form=e.target;
    const ukmId=form.dataset.koordinatorForm;
    const select=form.querySelector('select[name="akun_id"]');
    const button=form.querySelector('button[type="submit"]');
    const accountId=select?.value;
    if(!accountId)return toast('Pilih anggota BEM terlebih dahulu.');
    if(button){button.disabled=true;button.textContent='Menyimpan…';}
    try{
      const {data,error}=await sb.functions.invoke('ukm-coordinator',{body:{action:'assign',organization_id:ukmId,account_id:accountId}});
      if(error||!data?.ok){
        const reason=data?.error||error?.message||'Terjadi kesalahan.';
        console.error('BEM coordinator assignment failed:',{ukmId,accountId,reason,error});
        toast('Gagal menunjuk koordinator: '+reason);
        return;
      }
      toast('Koordinator BEM berhasil ditunjuk.');
      S.viewCache={};
      S.htmlCache={};
      return render({force:true});
    }catch(error){
      console.error('UKM coordinator assignment exception:',error);
      toast('Gagal menunjuk koordinator. Coba lagi.');
    }finally{
      if(button){button.disabled=false;button.textContent='Tunjuk';}
    }
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
