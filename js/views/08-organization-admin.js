/* Page renderers: organization, units, periods, positions, coordinators, and audit. */

V.organisasi = function(){
    const canWrite=S.user.peran==='wakil_rektor';
    const hasPeriods=Array.isArray(S.periods)&&S.periods.length>0;
    const currentOrg=(S.organizations||[]).find(o=>o.id===S.orgId);
    const bems=(S.organizations||[]).filter(o=>o.tipe==='BEM');
    const related=(S.organizationRelations||[]).filter(r=>r.organisasi_id===S.orgId||r.terhubung_dengan_id===S.orgId);

    const connectionCard=currentOrg?.tipe==='CLUB' && (S.permissions?.has('organisasi.relation.manage')||canWrite)
      ? '<div class="card mt-4"><h3>Koneksi UKM Minat Bakat</h3><p class="sub">UKM Minat Bakat dapat terhubung ke BEM, HMJ, UKM, atau UKM Minat Bakat lain.</p>'+
        '<form id="form-club-relasi"><select id="cr-org" required><option value="">Pilih organisasi terhubung</option>'+
        (S.organizations||[]).filter(o=>o.id!==currentOrg.id).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+organizationTypeLabel(o.tipe))+'</option>').join('')+
        '</select><button class="btn mt-3">Tambah koneksi</button></form>'+
        (related.length?'<div class="grid sm:grid-cols-2 gap-2 mt-4">'+related.map(r=>{
          const partner=r.organisasi_id===currentOrg.id?r.terhubung:r.organisasi;
          return '<div class="rounded-xl bg-slate-50 p-3 text-sm">'+esc(partner?.nama||'-')+' · '+esc(organizationTypeLabel(partner?.tipe))+'</div>';
        }).join('')+'</div>':'<p class="sub mt-3">Belum ada koneksi.</p>')+
        '</div>'
      : '';

    const createForm=!hasPeriods
      ? '<div class="card border border-amber-200 bg-amber-50"><h3 class="!text-amber-900">Belum ada periode</h3><p class="sub !text-amber-800">Buat periode terlebih dahulu.</p></div>'
      : (canWrite
        ? '<form id="form-organisasi" class="card"><h3>Tambah organisasi</h3>'+
          '<div class="f2"><div><label>Nama *</label><input id="o-nama" required></div>'+
          '<div><label>Tipe *</label><select id="o-tipe" required><option value="">Pilih tipe</option><option value="BEM">BEM</option><option value="HMJ">HMJ</option><option value="UKM">UKM</option><option value="CLUB">UKM Minat Bakat</option></select></div>'+
          '<div><label>Periode *</label><select id="o-periode" required><option value="">Pilih periode</option>'+
          S.periods.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama+' · '+x.status)+'</option>').join('')+
          '</select></div></div>'+
          '<div id="o-parent-wrap" hidden><label>Naungan BEM *</label><select id="o-parent"><option value="">Pilih BEM</option>'+
          bems.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+'</option>').join('')+
          '</select></div>'+
          '<div id="o-relasi-wrap" hidden><label>Koneksi UKM Minat Bakat</label><select id="o-relasi" multiple class="min-h-32">'+
          (S.organizations||[]).filter(o=>['BEM','HMJ','UKM','CLUB'].includes(o.tipe)).map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama+' · '+organizationTypeLabel(o.tipe))+'</option>').join('')+
          '</select><small>UKM Minat Bakat dapat terhubung ke satu atau banyak organisasi.</small></div>'+
          '<button class="btn mt-4">Simpan organisasi</button></form>'
        : '');

    const orgList=S.organizations.length
      ? '<div class="grid gap-3 mt-4">'+S.organizations.map(x=>{
          const parent=(S.organizations||[]).find(o=>o.id===x.induk_organisasi_id);
          return '<div class="card"><div class="flex items-start justify-between gap-3"><div><h3>'+esc(x.nama)+'</h3>'+
            '<p class="sub mb-1">'+esc(x.tipe)+'</p>'+
            '<p class="text-xs text-slate-500">'+(parent?'Di bawah '+esc(parent.nama):(x.tipe==='CLUB'?'UKM Minat Bakat multi-koneksi':'Organisasi utama'))+'</p></div>'+
            '<span class="chip bl">'+esc(x.tipe)+'</span></div></div>';
        }).join('')+'</div>'
      : emptyCard('Belum ada organisasi.');

    return pageHeader('Organisasi','Buat dan kelola BEM, HMJ, UKM, serta UKM Minat Bakat.',
      currentOrg?.tipe==='CLUB'?'<button class="btn" data-go="struktur">Kelola struktur UKM Minat Bakat</button>':'')+
      createForm+connectionCard+orgList;
};

V.unit_kerja = function(){
    return V.struktur();
};

V.periode = function(){
    const canWrite=S.user.peran==='wakil_rektor';
    return pageHeader('Periode','Tentukan siklus periode dan berapa hari batas LPJ setelah proker mulai berjalan.')+
      (canWrite?'<form id="form-periode" class="card"><h3>Buat periode</h3><div class="f2"><div><label>Nama periode *</label><input id="pe-nama" required></div><div><label>Batas LPJ (hari) *</label><input id="pe-batas-hari" type="number" min="1" max="365" value="7" required><small>Deadline LPJ dihitung otomatis saat status proker berubah menjadi <b>Berjalan</b>.</small></div></div><label>Status periode</label><select id="pe-status"><option value="disiapkan">Disiapkan</option><option value="aktif">Aktif</option><option value="masa_lpj">Masa LPJ</option><option value="arsip">Arsip</option></select><button class="btn mt-4">Simpan periode</button></form>':'')+
      (S.periods.length?'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">'+S.periods.map(x=>'<div class="card"><div class="flex justify-between gap-3"><h3>'+esc(x.nama)+'</h3>'+chip(x.status)+'</div><p class="sub">Batas LPJ: <b>'+esc(x.batas_lpj_hari ?? '-')+' hari</b> setelah proker mulai berjalan.</p></div>').join('')+'</div>':emptyCard('Belum ada periode.'));
};

V.jabatan = function(){
    if(S.user.peran!=='admin') return emptyCard('Akses hanya untuk administrator.');
    return pageHeader('Jabatan & hak akses','Atur modul yang dapat digunakan oleh setiap jabatan organisasi.')+
      '<div class="grid gap-4">'+
      (S.positions||[]).map(j=>{
        const selected=S.permissionMatrix?.[j.id]||new Set();
        return '<form class="card" data-role-form="'+esc(j.id)+'"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4"><div><h3>'+esc(j.nama)+'</h3><p class="sub mb-0">'+esc(j.kode)+' · '+esc(j.cakupan)+(j.unit_wajib?' · wajib divisi':'')+'</p></div><button class="btn" type="submit">Simpan hak akses</button></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">'+Object.entries(PERMISSION_CATALOG).map(([code,label])=>'<label class="rounded-xl border border-slate-200 px-3 py-2 text-sm flex items-center gap-2"><input type="checkbox" name="perm" value="'+esc(code)+'" '+(selected.has(code)?'checked':'')+' style="width:auto">'+esc(label)+'</label>').join('')+'</div></form>';
      }).join('')+'</div>';
};

V.koordinator = function(){
    const current=(S.organizations||[]).find(o=>o.id===S.orgId);
    const bemId=current?.tipe==='BEM'?current.id:current?.induk_organisasi_id;
    const ukms=(S.organizations||[]).filter(o=>['HMJ','UKM','CLUB'].includes(o.tipe) && (!bemId || o.induk_organisasi_id===bemId));
    const canManage=S.user.peran!=='admin' && S.permissions?.has('koordinator.manage');
    return pageHeader('Koordinator BEM','Anggota BEM yang ditunjuk Presiden BEM sebagai perantara pengajuan HMJ, UKM, dan UKM Minat Bakat.')+
      (S.user.peran==='admin'?'<div class="card border border-amber-200 bg-amber-50 mb-4"><p class="text-sm text-amber-900">Administrator dapat melihat data, tetapi penunjukan koordinator tetap harus dilakukan oleh Presiden BEM.</p></div>':'')+
      (ukms.length?'<div class="grid gap-4">'+ukms.map(u=>{
        const active=S.coordinatorAssignments.find(x=>x.organisasi_id===u.id);
        return '<div class="card"><div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h3>'+esc(u.nama)+'</h3><p class="sub">'+esc(organizationTypeLabel(u.tipe))+' di bawah '+esc((S.organizations||[]).find(o=>o.id===u.induk_organisasi_id)?.nama||'BEM')+'</p><p class="text-sm">Koordinator: <b>'+esc(active?.akun?.nama||'Belum ditunjuk')+'</b></p></div>'+
          (canManage?'<form class="flex gap-2" data-koordinator-form="'+esc(u.id)+'"><select name="akun_id" required><option value="">Memuat anggota BEM…</option></select><button class="btn">Tunjuk</button></form>':'')+
          '</div></div>';
      }).join('')+'</div>':emptyCard('Belum ada HMJ, UKM, atau UKM Minat Bakat pada BEM yang dipilih.'));
};

V.audit = function(){
    return pageHeader('Jejak audit','Riwayat perubahan penting dalam sistem.')+
      (S.audit.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Waktu</th><th>Akun</th><th>Aksi</th><th>Objek</th><th>ID</th></tr></thead><tbody>'+S.audit.map(x=>'<tr><td>'+dateID(x.waktu)+'</td><td>'+esc(x.akun?.nama||x.akun_id||'-')+'</td><td>'+esc(x.aksi||'-')+'</td><td>'+esc(x.objek||'-')+'</td><td class="text-xs">'+esc(x.objek_id||'-')+'</td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada jejak audit.'));
};
