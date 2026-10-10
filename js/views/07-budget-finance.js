/* Page renderers: budget ceilings, payouts, and fund use. */

V.plafon = function(){
    const b=S.budgets[0]||null;
    const canWrite=S.user.peran==='wakil_rektor';
    const plafon=Number(b?.plafon||0), digunakan=Number(b?.digunakan||0), tersisa=Number(b?.tersisa||0);
    const periodName=b?.periode?.nama||'Belum ada periode aktif';
    return pageHeader('Plafon dan anggaran','Anggaran kampus berlaku bersama untuk seluruh organisasi dalam satu periode.',
      S.user.peran==='wakil_rektor'?'<span class="chip bl">Wakil Rektor 1 · pengendali plafon</span>':'')+
      '<div class="g3 mb-4"><div class="k bl"><b>'+rp(plafon)+'</b>Plafon periode</div><div class="k er"><b>'+rp(digunakan)+'</b>Sudah disetujui</div><div class="k wa"><b>'+rp(tersisa)+'</b>Sisa plafon</div></div>'+
      (canWrite?'<form id="form-plafon" class="card"><h3>Atur plafon periode</h3><div class="f2"><div><label>Periode</label><select id="p-periode" required>'+((S.periods||[]).filter(x=>x.status==='aktif').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+'</option>').join('')||'<option value="">Tidak ada periode aktif</option>')+'</select></div><div><label>Total plafon kampus</label><input id="p-jumlah" type="text" inputmode="numeric" autocomplete="off" data-money="amount" value="'+esc(formatMoney(plafon))+'" required></div></div><p class="sub">Satu plafon dipakai bersama oleh BEM, HMJ, UKM, dan organisasi lain. Plafon berkurang ketika pengajuan anggaran disetujui.</p><button class="btn mt-4">Simpan plafon</button></form>':'')+
      '<div class="card"><div class="flex items-center justify-between gap-3 mb-4"><div><h3>'+esc(periodName)+'</h3><p class="sub">Penggunaan dihitung dari seluruh <b>anggaran yang sudah disetujui</b>.</p></div><span class="chip '+(tersisa>0?'ok':'er')+'">'+(plafon>0?Math.round((digunakan/plafon)*100):0)+'% terpakai</span></div>'+
      '<div class="h-3 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-blue-600" style="width:'+Math.min(plafon?digunakan/plafon*100:0,100)+'%"></div></div>'+
      '<div class="grid grid-cols-3 gap-3 mt-4"><div class="rounded-xl bg-slate-50 p-3"><small>Plafon</small><p class="font-bold">'+rp(plafon)+'</p></div><div class="rounded-xl bg-slate-50 p-3"><small>Digunakan</small><p class="font-bold">'+rp(digunakan)+'</p></div><div class="rounded-xl bg-slate-50 p-3"><small>Sisa</small><p class="font-bold">'+rp(tersisa)+'</p></div></div></div>'+
      '<div class="card"><div class="flex items-start justify-between gap-3 mb-4"><div><h3>Proposal yang menggunakan plafon kampus</h3><p class="sub">Hanya Proker dengan sumber dana <b>Kampus</b> dan anggaran yang sudah disetujui.</p></div><span class="chip '+(S.approvedCampusProkers.length?'ok':'wa')+'">'+S.approvedCampusProkers.length+' proposal</span></div>'+
      (S.approvedCampusProkers.length
        ? '<div class="space-y-3">'+S.approvedCampusProkers.map(x=>
            '<div class="rounded-2xl border border-slate-200 p-4">'+
              '<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">'+
                '<div class="min-w-0"><h4 class="font-bold truncate">'+esc(x.proker_nama||'-')+'</h4><p class="sub mb-1">'+esc(x.organisasi_nama||'-')+'</p><div class="flex flex-wrap gap-2 items-center">'+chip(x.status||'-')+(x.anggaran_diajukan!==x.anggaran_disetujui?'<span class="text-xs text-slate-500">Diajukan '+rp(x.anggaran_diajukan||0)+'</span>':'')+'</div></div>'+
                '<div class="sm:text-right shrink-0"><small>Disetujui</small><p class="text-lg font-bold text-emerald-800">'+rp(x.anggaran_disetujui||0)+'</p></div>'+
              '</div>'+
              (x.anggaran_disetujui_pada?'<p class="text-xs text-slate-500 mt-3">Disetujui pada '+dateTimeID(x.anggaran_disetujui_pada)+'</p>':'')+
            '</div>'
          ).join('')+'</div>'
        : '<div class="rounded-2xl border border-dashed border-slate-300 p-6 text-center"><p class="sub">Belum ada proposal sumber dana Kampus yang disetujui.</p></div>')+
      '</div>';
};

V.cair = function(){
    const rows=S.fundUsageProkers||[];
    const totalDiberikan=rows.reduce((n,x)=>n+Number(x.anggaran_disetujui||0),0);
    const totalDigunakan=rows.reduce((n,x)=>n+Number(x.digunakan||0),0);
    const totalSisa=Math.max(totalDiberikan-totalDigunakan,0);
    const today=new Date().toISOString().slice(0,10);
    return pageHeader('Penggunaan Dana','Catat penggunaan dana yang sudah disetujui untuk organisasi ini.')+
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">'+
        '<div class="card"><small>Dana diberikan</small><p class="text-2xl font-bold text-blue-700">'+rp(totalDiberikan)+'</p></div>'+
        '<div class="card"><small>Sudah digunakan</small><p class="text-2xl font-bold text-red-600">'+rp(totalDigunakan)+'</p></div>'+
        '<div class="card"><small>Sisa dana</small><p class="text-2xl font-bold text-emerald-700">'+rp(totalSisa)+'</p></div>'+
      '</div>'+
      '<div class="card"><h3>Catat penggunaan</h3><p class="sub mb-4">Pencatatan ini hanya mengurangi saldo penggunaan organisasi. Plafon kampus tetap mengikuti anggaran yang sudah disetujui.</p>'+
        '<form id="form-penggunaan" class="f2">'+
          '<div><label>Program kerja</label><select id="u-proker" required><option value="">Pilih proker</option>'+rows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+' · '+rp(x.anggaran_disetujui)+' tersedia '+rp(x.tersisa)+'</option>').join('')+'</select></div>'+
          '<div><label>Jumlah penggunaan</label><input id="u-jumlah" type="text" inputmode="numeric" autocomplete="off" data-money="amount" required></div>'+
          '<div><label>Tanggal</label><input id="u-tanggal" type="date" value="'+today+'"></div>'+
          '<div><label>Keterangan</label><input id="u-keterangan" type="text" maxlength="200" placeholder="Contoh: konsumsi rapat" required></div>'+
          '<div class="md:col-span-2"><button class="btn" '+(!rows.length?'disabled':'')+'>Simpan penggunaan</button></div>'+
        '</form></div>'+
      '<div class="card"><h3>Anggaran per proker</h3>'+
        (rows.length?'<div class="space-y-3">'+rows.map(x=>'<div class="rounded-2xl border border-slate-200 p-4"><div class="flex flex-col sm:flex-row sm:justify-between gap-2"><div><b>'+esc(x.nama)+'</b><p class="sub">Disetujui '+rp(x.anggaran_disetujui)+'</p></div><div class="sm:text-right"><b>'+rp(x.digunakan)+'</b><p class="sub">digunakan · sisa '+rp(x.tersisa)+'</p></div></div></div>').join('')+'</div>':emptyCard('Belum ada anggaran Kampus yang disetujui untuk organisasi ini.'))+
      '</div>'+
      '<div class="card overflow-x-auto"><h3>Riwayat penggunaan</h3>'+
        (S.payouts.length?'<table><thead><tr><th>Tanggal</th><th>Proker</th><th>Keterangan</th><th>Jumlah</th></tr></thead><tbody>'+S.payouts.map(x=>'<tr><td>'+dateID(x.tanggal)+'</td><td>'+esc(x.proker?.nama||'-')+'</td><td>'+esc(x.keterangan||'-')+'</td><td>'+rp(x.jumlah)+'</td></tr>').join('')+'</tbody></table>':emptyCard('Belum ada penggunaan dana.'))+
      '</div>';
};
