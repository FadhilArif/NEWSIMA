// Isi dari Supabase: Project Settings > API. Kosong = mode demo.
const SUPABASE_URL = '', SUPABASE_KEY = '';
const sb = SUPABASE_URL && window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const $ = s => document.querySelector(s), rp = n => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const ST = { draft:['Draft',''], proposal_diajukan:['Menunggu review','wa'], revisi:['Revisi','er'], disetujui:['Disetujui','ok'], berjalan:['Berjalan','ok'], selesai:['Selesai','bl'], tidak_terlaksana:['Tidak terlaksana','er'] };
const S = { user:{ nama:'Fadhli Arif', email:'fadhli@stikesmhk.ac.id' }, ctx:0, view:'beranda', tab:'semua', q:'', orgId:null,
  ctxs:[{ org:'HIMIKA', peran:'Ketua · 2026/2027', review:false }, { org:'Koordinator RACANA', peran:'Review', review:true }],
  proker:[{ id:1, nama:'Pelatihan Kader Dasar', ketua:'Andi Pratama', jenis:'mandiri', mulai:'2026-10-12', ajuan:8500000, cair:5000000, status:'berjalan' },
    { id:2, nama:'Seminar Kesehatan Mental', ketua:'Siti Rahma', jenis:'kolaboratif', mulai:'2026-10-16', ajuan:12000000, cair:6000000, status:'proposal_diajukan' },
    { id:3, nama:'Bakti Sosial Desa Sehat', ketua:'Dimas Arif', jenis:'mandiri', mulai:'2026-10-25', ajuan:7500000, cair:0, status:'draft' },
    { id:4, nama:'Lomba Inovasi Kesehatan', ketua:'Nadia Putri', jenis:'mandiri', mulai:'2026-11-05', ajuan:10000000, cair:0, status:'revisi' },
    { id:5, nama:'Webinar Karir Kesehatan', ketua:'Rizky Maulana', jenis:'kolaboratif', mulai:'2026-11-12', ajuan:6000000, cair:3000000, status:'disetujui' }] };
const MENU = [['Utama',[['beranda','Beranda'],['proker','Proker'],['undangan','Undangan kolaborasi'],['galeri','Galeri'],['laporan','Laporan akhir'],['struktur','Struktur dan anggota']]],
  ['Review',[['inbox','Inbox review'],['rapat','Rapat']]], ['Anggaran',[['plafon','Plafon dan anggaran'],['cair','Pencairan dan verifikasi']]],
  ['Admin',[['periode','Periode'],['akun','Akun dan penetapan'],['audit','Jejak audit']]]];

function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.append(e); setTimeout(() => e.remove(), 2600); }
async function loadProker() {
  if (!sb) return;
  const { data, error } = await sb.from('proker').select('id,nama,ketua_pelaksana,pengajuan,tanggal_mulai,status,item_anggaran(subtotal),pencairan_dana(jumlah)').order('tanggal_mulai');
  if (error) return toast('Gagal memuat proker: ' + error.message);
  S.proker = data.map(p => ({ id:p.id, nama:p.nama, ketua:p.ketua_pelaksana, jenis:p.pengajuan, mulai:p.tanggal_mulai, status:p.status === 'proposal_diajukan' ? p.status : p.status,
    ajuan:p.item_anggaran.reduce((a, i) => a + i.subtotal, 0), cair:p.pencairan_dana.reduce((a, i) => a + i.jumlah, 0) }));
}
const chip = s => { const [t, c] = ST[s] || [s, '']; return `<span class="chip ${c}">${t}</span>`; };

function renderShell() {
  $('#nav').innerHTML = MENU.map(([g, it]) => `<div class="grp">${g}</div>` + it.map(([k, t]) => `<button class="nav ${S.view === k ? 'on' : ''}" data-go="${k}">${t}</button>`).join('')).join('');
  $('#bn').innerHTML = [['beranda','Beranda'],['proker','Proker'],['form','+'],['inbox','Review'],['galeri','Galeri']].map(([k, t]) => `<button class="${k === 'form' ? 'fab' : S.view === k ? 'on' : ''}" data-go="${k}" aria-label="${t}">${t}</button>`).join('');
  $('#cx').innerHTML = S.ctxs.map((c, i) => `<option value="${i}" ${i === S.ctx ? 'selected' : ''}>${c.org} · ${c.peran}</option>`).join('');
  $('#av').textContent = S.user.nama.split(' ').map(w => w[0]).join('');
}
const V = {
  beranda: () => `<h1 class="t">Beranda</h1><p class="sub">Ringkasan aktivitas dari semua konteks Anda.</p>
  <div class="card"><h3>Perlu tindakan Anda</h3><div class="g3"><div class="k er"><b>3</b>Menunggu review</div><div class="k wa"><b>2</b>Perlu dilengkapi</div><div class="k bl"><b>1</b>Undangan kolaborasi</div></div></div>
  <div class="row2"><div class="card"><h3>Ringkasan anggaran HIMIKA</h3><div class="bar"><i style="width:42%"></i></div><p class="sub">Plafon Rp75.000.000 · Diajukan Rp48.600.000 · Cair Rp31.200.000 · Sisa Rp43.800.000</p></div>
  <div class="card"><h3>Batas LPJ terdekat</h3><p>Pelatihan Kader Dasar <span class="chip er">2 hari</span></p><p>Seminar Kesehatan Mental <span class="chip wa">5 hari</span></p></div></div>`,
  proker() {
    const f = S.proker.filter(p => (S.tab === 'semua' || p.status === S.tab) && p.nama.toLowerCase().includes(S.q.toLowerCase()));
    const tabs = [['semua','Semua'],['draft','Draft'],['proposal_diajukan','Menunggu review'],['revisi','Revisi'],['disetujui','Disetujui'],['berjalan','Berjalan']];
    return `<h1 class="t">Daftar program kerja</h1><p class="sub">Kelola program kerja organisasi Anda.</p>
    <div class="bar2"><input id="q" placeholder="Cari proker atau ketua" value="${S.q}"><button class="btn" data-go="form">+ Buat proker</button></div>
    <div class="tabs">${tabs.map(([k, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="card"><table><thead><tr><th>Nama program kerja</th><th>Jenis</th><th>Jadwal</th><th>Diajukan</th><th>Cair</th><th>Status</th></tr></thead><tbody>
    ${f.map(p => `<tr data-id="${p.id}" data-go="review"><td><b>${p.nama}</b><br><small>Ketua: ${p.ketua || '-'}</small></td><td>${p.jenis === 'kolaboratif' ? '<span class="chip pu">Kolaboratif</span>' : '<span class="chip">Mandiri</span>'}</td><td>${p.mulai}</td><td>${rp(p.ajuan)}</td><td>${rp(p.cair)}</td><td>${chip(p.status)}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada proker pada filter ini. Buat proker baru untuk memulai.</td></tr>'}</tbody></table></div>`;
  },
  form: () => `<h1 class="t">Form proposal program kerja</h1><p class="sub">Lengkapi data kegiatan, anggaran, dan dokumen proposal.</p>
  <div class="step"><span class="on">Data kegiatan</span><span>Anggaran</span><span>Dokumen</span><span>Pengajuan</span></div>
  <form id="ff" class="card" novalidate><div class="f2"><div><label for="n">Nama program kerja *</label><input id="n" name="nama" placeholder="Contoh: Seminar Kesehatan Mental"></div>
  <div><label for="j">Jenis kegiatan</label><select id="j" name="jenis"><option value="sekali">Sekali</option><option value="berulang">Berulang</option></select></div>
  <div><label for="m">Tanggal mulai *</label><input id="m" name="mulai" type="date"></div><div><label for="e">Tanggal selesai *</label><input id="e" name="selesai" type="date"><small>Batas LPJ otomatis 7 hari setelahnya.</small></div></div>
  <label for="t">Lokasi *</label><input id="t" name="tempat"><label for="d">Deskripsi kegiatan</label><textarea id="d" name="deskripsi" rows="3"></textarea>
  <label>Penyelenggara</label><label><input type="radio" name="pengajuan" value="mandiri" checked style="width:auto"> Diselenggarakan sendiri</label>
  <label><input type="radio" name="pengajuan" value="kolaboratif" style="width:auto"> Kolaboratif dengan organisasi lain</label>
  <div id="kb" hidden><label for="dk">Dana kampus proker (Rp)</label><input id="dk" type="number" min="0" value="0"><div id="ps"></div>
  <button type="button" class="btn w" id="tp">+ Tambah peserta</button><p class="sub" id="tt"></p></div><p class="err" id="fe"></p>
  <div style="margin-top:16px;display:flex;gap:8px"><button class="btn s" type="button" data-go="proker">Batal</button><button class="btn">Simpan draft</button></div></form>`,
  review: () => `<h1 class="t">Review dokumen proposal</h1><p class="sub">Seminar Kesehatan Mental · HMJ Keperawatan <span class="chip pu">Kolaboratif</span></p>
  <div class="row2"><div class="pdf"><div>PROPOSAL KEGIATAN<br>SEMINAR KESEHATAN MENTAL</div></div><div><div class="card"><h3>Ringkasan anggaran</h3><p>Total diajukan <b>Rp12.000.000</b></p><p>HMJ Keperawatan (40%): Rp4.800.000<br>UKM Psikomotif (60%): Rp7.200.000</p></div>
  <div class="card"><h3>Komentar</h3><p><b>Andi Pratama</b><br>Mohon dicek kembali rincian transportasi.</p><label for="kk">Tulis komentar *</label><textarea id="kk" rows="3" placeholder="Berikan komentar atau catatan"></textarea><p class="err" id="ke"></p>
  <div style="display:flex;gap:8px;margin-top:10px"><button class="btn d" data-act="revisi">Minta revisi</button><button class="btn w" data-act="teruskan">Teruskan</button><button class="btn" data-act="setuju">Setujui</button></div></div></div></div>`
};
function stub(t) { return `<h1 class="t">${t}</h1><p class="sub">Halaman ini mengikuti pola yang sama dan tersambung ke tabel Supabase terkait.</p><div class="card">Belum ada data untuk ditampilkan.</div>`; }
function render() { renderShell(); $('#v').innerHTML = (V[S.view] || (() => stub(S.view)))(); if (S.view === 'form') pesertaRow(true); }

function pesertaRow(reset) { const box = $('#ps'); if (!box) return; if (reset) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', `<div class="peserta"><input placeholder="Organisasi peserta" aria-label="Organisasi peserta"><input type="number" min="0" placeholder="Porsi Rp" aria-label="Porsi plafon"><button type="button" class="btn d" data-del aria-label="Hapus peserta">×</button></div>`); }
function totalPorsi() { return [...document.querySelectorAll('.peserta input[type=number]')].reduce((a, i) => a + (+i.value || 0), 0); }
function hitung() { const dk = +$('#dk')?.value || 0, tp = totalPorsi(); if ($('#tt')) $('#tt').textContent = `Porsi peserta ${rp(tp)} dari ${rp(dk)}. Beban penyelenggara utama ${rp(Math.max(dk - tp, 0))}.`; return tp <= dk; }

document.addEventListener('click', async e => {
  const go = e.target.closest('[data-go]'); if (go) { S.view = go.dataset.go; return render(); }
  const tab = e.target.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; return render(); }
  if (e.target.id === 'tp') { pesertaRow(); return hitung(); }
  if (e.target.closest('[data-del]')) { e.target.closest('.peserta').remove(); return hitung(); }
  const act = e.target.closest('[data-act]');
  if (act) {
    const k = $('#kk').value.trim();
    if (act.dataset.act === 'revisi' && !k) return $('#ke').textContent = 'Komentar wajib diisi saat meminta revisi.';
    $('#ke').textContent = '';
    if (sb) { const { error } = await sb.from('persetujuan').insert({ dokumen_id:S.dokId, tahap:'koordinator', keputusan:act.dataset.act, komentar:k }); if (error) return toast(error.message); }
    toast({ revisi:'Dokumen dikembalikan untuk revisi', teruskan:'Diteruskan ke tahap berikutnya', setuju:'Dokumen disetujui' }[act.dataset.act]); S.view = 'inbox'; render();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; render(); $('#q').focus(); } if (e.target.closest('#kb')) hitung(); });
document.addEventListener('change', e => { if (e.target.name === 'pengajuan') $('#kb').hidden = e.target.value !== 'kolaboratif'; if (e.target.id === 'cx') { S.ctx = +e.target.value; render(); } });
document.addEventListener('submit', async e => {
  if (e.target.id === 'fl') { e.preventDefault();
    if (sb) { const { error } = await sb.auth.signInWithPassword({ email:$('#em').value, password:$('#pw').value }); if (error) return $('#le').textContent = 'Email atau kata sandi salah.'; await loadProker(); }
    $('#login').hidden = true; $('#app').hidden = false; render(); }
  if (e.target.id === 'ff') { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), kolab = f.pengajuan === 'kolaboratif', er = [];
    if (!f.nama) er.push('Nama program kerja wajib diisi'); if (!f.mulai || !f.selesai) er.push('Tanggal mulai dan selesai wajib diisi'); if (f.selesai < f.mulai) er.push('Tanggal selesai tidak boleh sebelum tanggal mulai'); if (!f.tempat) er.push('Lokasi wajib diisi');
    if (kolab && !document.querySelector('.peserta input').value) er.push('Tambahkan minimal satu organisasi peserta'); if (kolab && !hitung()) er.push('Total porsi peserta melebihi dana kampus proker');
    $('#fe').textContent = er.join('. '); if (er.length) return;
    if (sb) { const { error } = await sb.from('proker').insert({ organisasi_id:S.orgId, nama:f.nama, jenis:f.jenis, tanggal_mulai:f.mulai, tanggal_selesai:f.selesai, tempat:f.tempat, deskripsi:f.deskripsi, pengajuan:f.pengajuan }); if (error) return toast(error.message); await loadProker(); }
    else S.proker.unshift({ id:Date.now(), nama:f.nama, ketua:S.user.nama, jenis:f.pengajuan, mulai:f.mulai, ajuan:0, cair:0, status:'draft' });
    toast('Draft proker tersimpan'); S.view = 'proker'; render(); }
});
