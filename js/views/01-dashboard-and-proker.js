/* Page renderers: home dashboard and Proker list. */

V.beranda = function(){
    const total=S.proker.length, waiting=S.proker.filter(x=>x.status==='proposal_diajukan').length;
    const running=S.proker.filter(x=>x.status==='berjalan').length;
    const unread=S.notifications.filter(x=>!x.read).length;
    const proposed=S.proker.reduce((a,x)=>a+Number(x.ajuan||0),0);
    const paid=S.proker.reduce((a,x)=>a+Number(x.cair||0),0);
    const upcoming=S.proker.filter(x=>x.tanggal_mulai&&new Date(x.tanggal_mulai)>=new Date()).sort((a,b)=>new Date(a.tanggal_mulai)-new Date(b.tanggal_mulai)).slice(0,5);
    return pageHeader('Beranda','Ringkasan aktivitas akun dan organisasi Anda.')+
      '<div class="g3 mb-4"><div class="k bl"><b>'+total+'</b>Program kerja</div><div class="k er"><b>'+waiting+'</b>Menunggu review</div><div class="k wa"><b>'+unread+'</b>Notifikasi belum dibaca</div></div>'+
      '<div class="row2"><div class="card"><h3>Ringkasan</h3><div class="grid grid-cols-2 gap-3 mt-3"><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Berjalan</div><div class="text-2xl font-bold">'+running+'</div></div><div class="rounded-xl bg-slate-50 p-3"><div class="text-xs text-slate-500">Diajukan</div><div class="text-2xl font-bold">'+rp(proposed)+'</div></div></div><p class="sub mt-3">Total pencairan: <b class="text-slate-900">'+rp(paid)+'</b></p></div>'+
      '<div class="card"><h3>Agenda terdekat</h3>'+(upcoming.length?upcoming.map(x=>'<div class="py-3 border-b border-slate-100 last:border-0"><p class="font-semibold">'+esc(x.nama)+'</p><p class="text-xs text-slate-500">'+dateID(x.tanggal_mulai)+' · '+esc(x.status)+'</p></div>').join(''):'<p class="sub">Belum ada agenda.</p>')+'</div></div>';
};

V.proker = function(){
    const f=S.proker.filter(p=>(S.tab==='semua'||p.status===S.tab)&&((p.nama||'').toLowerCase().includes(S.q.toLowerCase())||(p.ketua||'').toLowerCase().includes(S.q.toLowerCase())));
    const tabs=[['semua','Semua'],['direncanakan','Direncanakan'],['revisi','Perlu revisi'],['proposal_diajukan','Menunggu review'],['disetujui','Disetujui'],['berjalan','Berjalan'],['selesai','Selesai'],['lpj_diajukan','LPJ review'],['lpj_disetujui','LPJ disetujui']];
    const isBemReviewerFor=(p)=>{
      return ['bem','bem_from_wakil_rektor','bem_lpj'].includes(p.review_stage) &&
        p.organisasi?.tipe==='HMJ' &&
        String(p.organisasi?.induk_organisasi_id||'')===String(S.orgId||'') &&
        S.permissions?.has(p.review_stage==='bem_lpj'?'laporan.review':'dokumen.review');
    };
    const isStageReviewerFor=(p)=>{
      return isUkmStageReviewer(p) ||
        isBemReviewerFor(p) ||
        (S.user.peran==='pembimbing' && ['pembimbing_hmj','pembimbing_hmj_lpj'].includes(p.review_stage) && S.permissions?.has(p.review_stage==='pembimbing_hmj_lpj'?'laporan.review':'dokumen.review')) ||
        (S.user.peran==='wakil_rektor' && ['wakil_rektor','wakil_rektor_lpj'].includes(p.review_stage));
    };
    const actionLabel=(p)=>{
      if(isStageReviewerFor(p)) return 'Review pengajuan';
      if(p.__coordinatorReadOnly||p.__dekanReadOnly)return 'Lihat proker';
      if(S.user.peran==='wakil_rektor'){
        if(['proposal_diajukan','lpj_diajukan'].includes(p.status)) return 'Review pengajuan';
        return 'Lihat proker';
      }
      if(S.user.peran==='pembimbing'){
        return p.review_stage==='pembimbing_hmj' ? 'Review pengajuan' : 'Lihat proker';
      }
      if(p.__ukmBphReadOnly)return 'Lihat proker';
      if(p.__collaborator)return 'Lihat proker';
      if(p.status==='direncanakan')return 'Ajukan proposal';
      if(p.status==='revisi')return 'Ajukan ulang';
      if(p.status==='disetujui')return 'Mulai pelaksanaan';
      if(p.status==='berjalan')return 'Tandai selesai';
      if(p.status==='selesai')return 'Ajukan LPJ';
      if(p.status==='proposal_diajukan')return 'Lihat review';
      if(p.status==='lpj_diajukan')return 'Review LPJ';
      return 'Lihat detail';
    };
    const prokerDescription=S.user.peran==='dekan'
      ? 'Antrean review aktif Dekan dan pantauan proker HMJ yang sudah diteruskan atau selesai direview.'
      : S.user.peran==='kaprodi'
        ? 'Program kerja HMJ pada program studi Anda, termasuk pengajuan yang menunggu review Kaprodi.'
        : 'Kelola program kerja Anda.';
    return pageHeader('Daftar program kerja',prokerDescription,canAccessView('form')?'<button class="btn" data-go="form">+ Buat proker</button>':'')+
      '<div class="bar2"><input id="q" placeholder="Cari proker atau ketua" value="'+esc(S.q)+'"></div>'+
      '<div class="tabs">'+tabs.map(x=>'<button class="'+(S.tab===x[0]?'on':'')+'" data-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'+
      (f.length?'<div class="card overflow-x-auto proker-table"><table><thead><tr><th>Program</th><th>Organisasi</th><th>Jadwal</th><th>Diajukan</th><th>Cair</th><th>Status</th><th>Tahap</th><th>Tindak lanjut</th></tr></thead><tbody>'+
        f.map(p=>'<tr><td><b>'+esc(p.nama)+'</b><br><small>Ketua: '+esc(p.ketua||'-')+'</small></td><td>'+esc(p.organisasi?.nama||'-')+'</td><td>'+dateID(p.tanggal_mulai)+'</td><td>'+rp(p.ajuan)+'</td><td>'+rp(p.cair)+'</td><td>'+chip(p.status)+'</td><td>'+esc(reviewStageLabel(p.review_stage,p.organisasi?.tipe)||'—')+'</td><td><button class="btn s" data-go="review:'+esc(p.id)+'">'+esc(actionLabel(p))+'</button></td></tr>').join('')+
        '</tbody></table></div>':emptyCard('Belum ada proker yang sesuai.'));
};
