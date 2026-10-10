/* Page renderers: collaboration invitations and review inbox. */

V.undangan = function(){
    return pageHeader('Undangan kolaborasi',S.user.peran==='wakil_rektor'?'Pantauan undangan kolaborasi · akses hanya baca.':'Kelola undangan organisasi untuk program kerja.')+
      (S.undangan.length?'<div class="grid gap-3">'+S.undangan.map(x=>'<div class="card"><div class="flex items-center justify-between gap-3"><div><h3>'+esc(x.proker?.nama||'Program kerja')+'</h3><p class="sub mb-1">'+dateID(x.proker?.tanggal_mulai)+'</p><p class="text-sm text-slate-600">Kolaborasi organisasi</p></div><div class="flex gap-2"><span class="chip '+(x.status==='bergabung'?'ok':x.status==='menolak'?'er':'wa')+'">'+esc(x.status)+'</span>'+(x.status==='diundang' && S.user.peran!=='wakil_rektor'?'<button class="btn w" data-collab-action="bergabung" data-proker-id="'+esc(x.proker_id)+'" data-org-id="'+esc(x.organisasi_id)+'">Terima</button><button class="btn d" data-collab-action="menolak" data-proker-id="'+esc(x.proker_id)+'" data-org-id="'+esc(x.organisasi_id)+'">Tolak</button>':'')+'</div></div></div>').join('')+'</div>':emptyCard('Belum ada undangan.'));
};

V.inbox = function(){
    const inboxDescription=S.user.peran==='dekan'
      ? 'Review informasi proposal dan LPJ HMJ dari seluruh program studi; setelah selesai, teruskan ke Wakil Rektor 1.'
      : S.user.peran==='kaprodi'
        ? 'Review proposal dan LPJ HMJ pada program studi yang ditugaskan kepada Anda.'
        : 'Pengajuan yang sedang menunggu tindakan sesuai peran Anda.';
    return pageHeader('Inbox review',inboxDescription)+
      (S.inbox.length?'<div class="grid gap-3">'+S.inbox.map(x=>{
        const stageLabel=reviewStageLabel(x.tahap,x.organisasi?.tipe);
        const kind=x.jenis==='laporan_akhir'?'LPJ':'Proposal';
        return '<article class="card"><div class="flex flex-wrap items-center justify-between gap-3"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2 mb-1"><span class="chip bl">'+esc(kind)+'</span><span class="chip wa">'+esc(stageLabel||x.status||'Menunggu review')+'</span></div><h3>'+esc(x.proker?.nama||'Dokumen')+'</h3><p class="sub mb-0">'+esc(x.organisasi?.nama||'Organisasi')+' · '+esc(x.status||'-')+'</p></div><button class="btn" data-go="review:'+esc(x.proker_id||'')+'">Buka pengajuan</button></div></article>';
      }).join('')+'</div>':emptyCard('Belum ada pengajuan yang menunggu tindakan Anda.'));
};
