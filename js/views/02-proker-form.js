/* Page renderer: Proker creation and editing form. */

V.form = function(){
    const privileged=['admin','wakil_rektor'].includes(S.user.peran);
    const currentOrg=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
    const edit=S.editProkerId ? S.detail?.proker : null;
    const isEdit=!!(edit && String(edit.id)===String(S.editProkerId));
    const org=(S.organizations||[]).find(o=>String(o.id)===String(edit?.organisasi_id));
    const title=isEdit?'Edit program kerja':'Form proposal program kerja';
    const desc=isEdit?'Perbarui data proker yang masih direncanakan atau sedang dalam revisi.':'Lengkapi data kegiatan sebelum menjadi draft.';
    const allowedFunding=new Set(['KAMPUS','PRODI','PRIBADI','TANPA_DANA','LAIN_LAIN']);
    const funding=(S.sources||[]).filter(x=>allowedFunding.has(x.kode)).length
      ? (S.sources||[]).filter(x=>allowedFunding.has(x.kode))
      : [{kode:'KAMPUS',nama:'Kampus',wajib_rincian:false,hitung_plafon:true},{kode:'PRODI',nama:'Prodi',wajib_rincian:false,hitung_plafon:false},{kode:'PRIBADI',nama:'Pribadi',wajib_rincian:false,hitung_plafon:false},{kode:'TANPA_DANA',nama:'Tanpa dana',wajib_rincian:false,hitung_plafon:false},{kode:'LAIN_LAIN',nama:'Lain-lain',wajib_rincian:true,hitung_plafon:false}];
    const currentFunding=edit?.sumber_dana_kode||'KAMPUS';
    const totalBudget=formatMoney(edit?.anggaran_total??edit?.anggaran_diajukan??0);
    const detailClass=currentFunding==='LAIN_LAIN'?'':'hidden';
    const sourceOptions=funding.map(x=>'<option value="'+esc(x.kode)+'" '+(String(currentFunding)===String(x.kode)?'selected':'')+'>'+esc(x.nama)+(x.hitung_plafon?' · mengurangi plafon kampus':' · tidak mengurangi plafon')+'</option>').join('');
    return pageHeader(title,desc)+
      '<form id="ff" class="card" novalidate>'+
      (isEdit
        ? '<div class="card bg-slate-50 border border-slate-200 mb-4"><small>Organisasi</small><p class="font-bold mt-1">'+esc(org?.nama||'-')+'</p><p class="text-xs text-slate-500 mt-1">Organisasi proker tidak dapat diubah setelah dibuat.</p></div>'
        : (privileged
          ? '<label for="f-org">Organisasi *</label><select id="f-org" name="organisasi_id" required><option value="">Pilih organisasi</option>'+orgOptions(S.orgId)+'</select>'
          : '<div class="card bg-slate-50 mb-4"><small>Organisasi</small><p class="font-bold mt-1">'+esc(currentOrg?.nama||'Belum ada organisasi')+'</p><p class="text-xs text-slate-500 mt-1">'+esc(organizationTypeLabel(currentOrg?.tipe))+' · konteks akun aktif</p></div>'))+
      '<div class="f2"><div><label>Nama program kerja *</label><input id="n" name="nama" value="'+esc(edit?.nama||'')+'" required></div><div><label>Jenis</label><select id="j" name="jenis"><option value="sekali" '+(edit?.jenis!=='berulang'?'selected':'')+'>Sekali</option><option value="berulang" '+(edit?.jenis==='berulang'?'selected':'')+'>Berulang</option></select></div><div><label>Tanggal mulai *</label><input id="m" name="mulai" type="date" value="'+esc(edit?.tanggal_mulai||'')+'" required></div><div><label>Tanggal selesai *</label><input id="e" name="selesai" type="date" value="'+esc(edit?.tanggal_selesai||'')+'" required></div></div>'+
      '<label>Lokasi *</label><input id="t" name="tempat" value="'+esc(edit?.tempat||'')+'" required><label>Deskripsi</label><textarea id="d" name="deskripsi" rows="3">'+esc(edit?.deskripsi||'')+'</textarea>'+
      '<div class="card bg-slate-50 border border-slate-200 mb-4"><div class="f2"><div><label>Sumber dana *</label><select id="f-sumber" name="sumber_dana_kode" required>'+sourceOptions+'</select></div><div><label>Total anggaran</label><input id="f-anggaran" name="anggaran_total" type="text" inputmode="numeric" autocomplete="off" data-money="amount" value="'+esc(totalBudget)+'"><small>Hanya nominal dengan sumber <b>Kampus</b> yang diajukan ke Wakil Rektor dan mengurangi plafon kampus.</small></div></div><div id="f-sumber-detail-wrap" class="mt-3 '+detailClass+'"><label>Detail sumber dana *</label><input id="f-sumber-detail" name="sumber_dana_detail" value="'+esc(edit?.sumber_dana_detail||'')+'" placeholder="Contoh: sponsor perusahaan / bantuan alumni"><small>Wajib diisi untuk sumber dana Lain-lain.</small></div><p id="f-sumber-note" class="sub mt-3"></p></div>'+
      (isEdit
        ? '<div class="card bg-amber-50 border border-amber-200 mb-4"><p class="text-sm text-amber-900"><b>Mode edit:</b> data kegiatan, sumber dana, anggaran, dan kolaborator dapat diperbarui selama Proker masih direncanakan atau perlu revisi.</p></div>'+
          '<div class="card border border-slate-200 mb-4"><div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><h3>Kolaborator</h3><p class="sub mb-0">Tambahkan organisasi susulan atau hapus organisasi yang tidak lagi terlibat. Rincian anggaran kolaborator dijelaskan di proposal, bukan di sini.</p></div><span class="chip bl">Bisa diubah</span></div><div id="kb" class="mt-4"><div id="ps"></div><button type="button" class="btn w mt-3" id="tp">+ Tambah organisasi</button><p class="sub mt-2" id="tt"></p></div></div>'
        : '<label>Penyelenggara</label><label><input type="radio" name="pengajuan" value="mandiri" checked style="width:auto"> Mandiri</label><label><input type="radio" name="pengajuan" value="kolaboratif" style="width:auto"> Kolaboratif</label><div id="kb" hidden><label>Organisasi yang diajak kolaborasi</label><div id="ps"></div><button type="button" class="btn w" id="tp">+ Tambah organisasi</button><p class="sub">Pilih BEM, UKM, atau HMJ lain. Rincian anggaran kolaborasi dicantumkan dalam proposal.</p></div>')+
      '<p class="err" id="fe"></p><div class="flex gap-2 mt-4"><button class="btn s" type="button" data-go="'+(isEdit?'review':'proker')+'">Batal</button><button class="btn">'+(isEdit?'Simpan perubahan':'Simpan draft')+'</button></div></form>';
};
