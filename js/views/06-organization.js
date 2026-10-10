/* Page renderers: members, organization structure, and meetings. */

V.anggota = function(){
    const role=S.user.peran;
    const current=(S.organizations||[]).find(o=>String(o.id)===String(S.orgId||''));
    const supervisedName=role==='pembimbing' ? (current?.nama||'HMJ') : 'Badan Eksekutif Mahasiswa';
    const allowedPeriodIds=role==='wakil_rektor'
      ? [...new Set((S.organizations||[]).filter(o=>o.tipe==='BEM'&&o.periode_id).map(o=>o.periode_id))]
      : [...new Set((S.organizations||[]).filter(o=>o.tipe==='HMJ'&&o.periode_id&&String(o.nama).toLowerCase()===String(supervisedName).toLowerCase()).map(o=>o.periode_id))];

    const periods=(S.periods||[]).filter(p=>allowedPeriodIds.includes(p.id));
    const filtered=S.anggota.filter(x=>
      String(x.nama||'').toLowerCase().includes(String(S.anggotaQ||'').toLowerCase())
    );

    return pageHeader(
      'Lihat anggota',
      role==='pembimbing'
        ? 'Daftar anggota '+supervisedName+' berdasarkan periode yang dipilih.'
        : 'Daftar anggota BEM berdasarkan periode yang dipilih.'
    )+
    '<div class="card mb-4">'+
      '<div class="grid sm:grid-cols-[220px_1fr] gap-3 items-end">'+
        '<div><label>Periode</label><select id="anggota-period">'+
          periods.map(p=>'<option value="'+esc(p.id)+'" '+(String(p.id)===String(S.anggotaPeriodId||'')?'selected':'')+'>'+esc(p.nama)+'</option>').join('')+
        '</select></div>'+
        '<div><label>Cari nama anggota</label><input id="anggota-q" type="search" placeholder="Ketik nama anggota..." value="'+esc(S.anggotaQ||'')+'"></div>'+
      '</div>'+
      '<div class="flex items-center justify-between gap-3 mt-4">'+
        '<p class="sub mb-0">'+filtered.length+' anggota ditemukan'+(S.anggotaQ?' untuk pencarian "'+esc(S.anggotaQ)+'"':'')+'</p>'+
        (role==='pembimbing'
          ? '<span class="chip bl">'+esc(supervisedName)+'</span>'
          : '<span class="chip bl">BEM</span>')+
      '</div>'+
    '</div>'+
    (filtered.length
      ? '<div class="card overflow-x-auto"><table><thead><tr><th>Nama</th><th>Jabatan</th><th>Unit kerja</th><th>NIM</th></tr></thead><tbody>'+
        filtered.map(x=>'<tr><td><b>'+esc(x.nama||'-')+'</b></td><td>'+esc(x.jabatan_nama||x.jabatan||'Anggota')+'</td><td>'+esc(x.unit_nama||'-')+'</td><td>'+esc(x.nim||'-')+'</td></tr>').join('')+
        '</tbody></table></div>'
      : emptyCard(S.anggotaQ?'Tidak ada anggota dengan nama tersebut.':'Belum ada anggota pada periode yang dipilih.')
    );
};

V.struktur = function(){
    if(S.user.peran==='dekan'){
      const hmjOptions=new Map();
      S.dekanDirectory.forEach(row=>{if(!hmjOptions.has(row.hmj_id))hmjOptions.set(row.hmj_id,{nama:row.hmj_nama,jumlah:0});if(row.akun_id)hmjOptions.get(row.hmj_id).jumlah++;});
      return pageHeader('Direktori HMJ dan anggota','Lihat seluruh HMJ beserta anggota aktif lintas program studi.')+
        '<div class="card mb-4"><div class="grid gap-3 md:grid-cols-3">'+
          '<div><label for="dekan-hmj-filter">Filter per HMJ</label><select id="dekan-hmj-filter"><option value="">Semua HMJ</option>'+[...hmjOptions.entries()].map(([id,x])=>'<option value="'+esc(id)+'" '+(String(S.dekanDirectoryHmjId)===String(id)?'selected':'')+'>'+esc(x.nama)+' ('+x.jumlah+' anggota)</option>').join('')+'</select></div>'+
          '<div><label for="dekan-hmj-q">Cari nama HMJ</label><input id="dekan-hmj-q" type="search" placeholder="Contoh: MERSA" value="'+esc(S.dekanDirectoryHmjQ||'')+'"></div>'+
          '<div><label for="dekan-member-q">Cari nama anggota / NIM</label><input id="dekan-member-q" type="search" placeholder="Nama mahasiswa atau NIM" value="'+esc(S.dekanDirectoryMemberQ||'')+'"></div>'+
        '</div><p class="sub mt-3 mb-0">Filter bisa dipakai sendiri atau digabung. Daftar memuat akun anggota yang aktif.</p></div>'+
        '<div id="dekan-directory-results">'+dekanDirectoryRowsHtml()+'</div>';
    }
    const isPrivileged=['admin','wakil_rektor'].includes(S.user.peran);
    const selectedId=isPrivileged ? (S.structureOrgId||'') : (S.orgId||'');
    const org=(S.organizations||[]).find(o=>o.id===selectedId);
    const type=org?.tipe;
    const units=(S.units||[]).filter(x=>x.organisasi_id===selectedId);
    const parent=(S.organizations||[]).find(o=>o.id===org?.induk_organisasi_id);
    const canUnit=S.user.peran==='admin' || S.permissions?.has('unit.manage');
    const targetOptions=(S.organizations||[])
      .filter(o=>o.tipe==='BEM'||o.tipe==='HMJ')
      .map(o=>'<option value="'+esc(o.id)+'" '+(String(o.id)===String(selectedId)?'selected':'')+'>'+esc(o.nama+' · '+organizationTypeLabel(o.tipe))+'</option>')
      .join('');

    let html=pageHeader(
      org ? 'Struktur '+esc(org.nama) : 'Struktur organisasi',
      org ? (type==='BEM' ? 'BEM menggunakan Kementerian.' : type==='HMJ' ? 'HMJ menggunakan Divisi.' : type==='UKM' ? 'UKM memiliki BPH dan koordinator.' : 'UKM Minat Bakat memiliki pengurus dan anggota.') : 'Pilih organisasi untuk mengelola struktur.'
    );

    if(isPrivileged){
      html+='<div class="card mb-4"><h3>Pilih organisasi</h3><div class="f2"><div><label>Organisasi</label><select id="struktur-org"><option value="">Pilih BEM atau HMJ</option>'+targetOptions+'</select></div><div><label>Jenis unit</label><input readonly value="'+(type==='BEM'?'Kementerian':type==='HMJ'?'Divisi':'-')+'"><small>Jenis unit mengikuti tipe organisasi.</small></div></div></div>';
    }

    if(org){
      html+='<div class="card mb-4"><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><div><small>Tipe</small><p class="font-bold mt-1">'+esc(type)+'</p></div><div><small>Induk</small><p class="font-bold mt-1">'+esc(parent?.nama||'Tidak ada')+'</p></div><div><small>Unit kerja</small><p class="font-bold mt-1">'+units.length+'</p></div><div><small>Mode</small><p class="font-bold mt-1">'+(type==='BEM'?'Kementerian':type==='HMJ'?'Divisi':'Tanpa unit')+'</p></div></div></div>';

      if((type==='BEM'||type==='HMJ')&&canUnit){
        const label=type==='BEM'?'Kementerian':'Divisi';
        const placeholder=type==='BEM'?'Contoh: KOMINFO':'Contoh: Divisi PSDM';
        html+='<div class="card mb-4"><div class="flex items-center justify-between gap-3 mb-3"><div><h3>Kelola '+label+'</h3><p class="sub mb-0">Unit akan otomatis terhubung ke <b>'+esc(org.nama)+'</b>.</p></div><span class="chip bl">'+units.length+' unit</span></div><form id="form-unit" class="rounded-2xl bg-slate-50 p-4"><div class="f2"><div><label>Nama '+label+' *</label><input id="u-nama" required placeholder="'+placeholder+'"></div><div><label>Jenis unit</label><input id="u-jenis" readonly value="'+(type==='BEM'?'kementerian':'divisi')+'"></div></div><button class="btn mt-4">Simpan '+label+'</button></form></div>';
      }

      if(units.length){
        html+='<div class="card mb-4"><h3>Unit kerja</h3><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">'+units.map(x=>'<div class="rounded-2xl border border-slate-200 p-4"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><h4 class="font-bold break-words">'+esc(x.nama)+'</h4><p class="text-xs text-slate-500 mt-1">'+esc(x.jenis)+' · '+esc(org.nama)+'</p></div>'+(S.user.peran==='admin'&&['kementerian','divisi'].includes(x.jenis)?'<button type="button" class="btn d s shrink-0" data-unit-delete="'+esc(x.id)+'" data-unit-name="'+esc(x.nama)+'">Hapus</button>':'')+'</div></div>').join('')+'</div></div>';
      }else if(type==='BEM'||type==='HMJ'){
        html+='<div class="card mb-4"><p class="sub">Belum ada '+(type==='BEM'?'Kementerian.':'Divisi.')+'</p></div>';
      }

      if(type==='BEM'){
        html+='<div class="card mb-4"><h3>Badan Pengurus Harian BEM</h3><p class="sub">Presiden · Wakil Presiden · Sekretaris · Bendahara</p></div>';
      }else if(type==='HMJ'){
        html+='<div class="card mb-4"><h3>Struktur HMJ</h3><p class="sub">Ketua · Wakil Ketua · Sekretaris · Bendahara · Divisi · Ketua Divisi · Staff</p></div>';
      }else if(type==='UKM'){
        html+='<div class="card mb-4"><h3>Struktur UKM</h3><p class="sub">Ketua · Wakil Ketua · Sekretaris · Bendahara · Koordinator dari BEM</p></div>';
      }else if(type==='CLUB'){
        html+='<div class="card mb-4"><h3>Struktur UKM Minat Bakat</h3><p class="sub">Ketua · Sekretaris · Bendahara · anggota tanpa akun</p></div>';
      }

      if(S.structure.length){
        html+='<div class="card"><h3>Akun anggota</h3><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">'+S.structure.map(x=>'<div class="rounded-2xl border border-slate-200 p-4"><h4 class="font-bold">'+esc(x.user?.nama||'Pengguna')+'</h4><p class="sub mb-1">'+esc(x.jabatan||'-')+'</p><p class="text-sm">'+esc(x.unit?.nama||'BPH/Organisasi')+'</p></div>').join('')+'</div></div>';
      }else{
        html+='<div class="card"><p class="sub">Belum ada akun anggota pada organisasi ini.</p></div>';
      }
    }

    return html;
};

V.rapat = function(){
    const canWrite=['admin','wakil_rektor','pembimbing'].includes(S.user.peran);
    return pageHeader('Rapat','Agenda dan hasil rapat.')+
      (canWrite?'<form id="form-rapat" class="card"><h3>Catat rapat</h3><div class="f2"><div><label>Nomor</label><input id="r-nomor" type="number" min="1"></div><div><label>Tanggal</label><input id="r-tanggal" type="date"></div></div><label>Dokumen ID</label><input id="r-dokumen" required><label>Peserta</label><textarea id="r-peserta" rows="2"></textarea><label>Notulen</label><textarea id="r-notulen" rows="3"></textarea><label>Hasil</label><select id="r-hasil"><option value="lanjut">Lanjut</option><option value="revisi">Revisi</option></select><button class="btn mt-4">Simpan</button></form>':'')+
      (S.meetings.length?'<div class="grid gap-3">'+S.meetings.map(x=>'<div class="card"><div class="flex justify-between gap-3"><div><h3>Rapat #'+esc(x.nomor||'-')+'</h3><p class="sub mb-1">'+dateID(x.tanggal)+' · '+esc(x.dokumen_id)+'</p></div>'+chip(x.hasil||'-')+'</div><p class="text-sm">'+esc(x.notulen||'Belum ada notulen.')+'</p></div>').join('')+'</div>':emptyCard('Belum ada rapat.'));
};
