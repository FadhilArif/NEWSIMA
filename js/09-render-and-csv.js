/* SIMA MHS: view rendering, photo previews, money helpers, and CSV processing. */


function buildViewHtml(view){
  try{
    const viewFn=V[view]||(()=>emptyCard('Modul tidak tersedia.'));
    return storageAdminBanner()+viewFn();
  }catch(error){
    console.error('View render failed:',{view,error});
    return '<div class="card border border-red-200 bg-red-50"><h3 class="!text-red-900">Gagal menampilkan halaman</h3><p class="sub !text-red-800">Terjadi kesalahan saat merender modul ini. Muat ulang halaman untuk mencoba lagi.</p></div>';
  }
}

async function render(options={}) {
  const token=++S.renderToken;
  const root=$('#v');
  if(!root)return;

  const view=S.view;
  // Reuse the last rendered screen immediately; refresh data in the background.
  const cacheable=!['form','review'].includes(view);
  const cachedHtml=cacheable&&!options.force?getHtmlCache(view):null;
  const dataCached=cacheable&&!options.force&&!cachedHtml&&restoreView(view);
  const hadContent=!!root.innerHTML.trim();

  if(cachedHtml){
    root.innerHTML=cachedHtml;
    root.classList.remove('view-initial-loading');
    root.classList.add('view-refreshing');
    renderShell();

    loadViewData(view).then(()=>{
      if(token!==S.renderToken||S.view!==view)return;
      const fresh=buildViewHtml(view);
      setHtmlCache(view,fresh);
      root.innerHTML=fresh;
      root.classList.remove('view-refreshing','view-initial-loading');
      renderShell();
      document.querySelectorAll('[data-money]').forEach(syncMoneyInput);
    }).catch(error=>console.warn('Background refresh gagal:',error));
    return;
  }

  if(dataCached){
    const instant=buildViewHtml(view);
    root.innerHTML=instant;
    root.classList.remove('view-initial-loading');
    root.classList.add('view-refreshing');
    renderShell();

    loadViewData(view).then(()=>{
      if(token!==S.renderToken||S.view!==view)return;
      const fresh=buildViewHtml(view);
      setHtmlCache(view,fresh);
      root.innerHTML=fresh;
      root.classList.remove('view-refreshing','view-initial-loading');
      renderShell();
      document.querySelectorAll('[data-money]').forEach(syncMoneyInput);
    }).catch(error=>console.warn('Background refresh gagal:',error));
    return;
  }

  if(hadContent){
    root.classList.add('view-refreshing');
  }else{
    root.innerHTML='<div class="page-loading" aria-label="Memuat halaman"><div class="loading-shimmer w-40"></div><div class="loading-shimmer w-64"></div><div class="loading-panel"></div></div>';
    root.classList.add('view-initial-loading');
  }

  try{
    await loadViewData(view);
  }catch(error){
    console.error(error);
    if(token!==S.renderToken)return;
    root.classList.remove('view-initial-loading','view-refreshing');
    if(!hadContent){
      root.innerHTML='<div class="card"><h3>Gagal memuat halaman</h3><p class="sub">'+esc(error?.message||'Terjadi kesalahan tak terduga.')+'</p></div>';
    }else{
      toast('Pembaruan gagal dimuat. Data yang tampil sebelumnya tetap dipertahankan.');
    }
    return;
  }

  if(token!==S.renderToken)return;
  const html=buildViewHtml(view);
  if(cacheable)setHtmlCache(view,html);
  root.innerHTML=html;
  root.classList.remove('view-initial-loading','view-refreshing');
  if(view==='form'){
    if(S.editProkerId){
      const kb=$('#kb');
      if(kb)kb.hidden=false;
      pesertaRow(true,S.detail?.kolaborator||[]);
      hitung();
    }else{
      pesertaRow(true);
    }
  }
  renderShell();
  document.querySelectorAll('[data-money]').forEach(syncMoneyInput);
  if(view==='form'){
    const source=$('#f-sumber');
    if(source)source.dispatchEvent(new Event('change',{bubbles:true}));
  }
  if(view==='akun'){
    syncSpecialAccountRole();
    syncAdditionalAssignment();
  }

  if(view==='koordinator'){
    document.querySelectorAll('[data-koordinator-form]').forEach(async form=>{
      const ukmId=form.dataset.koordinatorForm;
      const select=form.querySelector('select[name="akun_id"]');
      const button=form.querySelector('button[type="submit"]');
      if(!select || S.user.peran==='admin')return;
      try{
        const {data,error}=await sb.functions.invoke('ukm-coordinator',{body:{action:'candidates',organization_id:ukmId}});
        const candidates=data?.candidates||[];
        if(!error&&data?.ok){
          select.disabled=false;
          select.innerHTML='<option value="">Pilih anggota BEM</option>'+candidates.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama)+' · '+esc(x.nim||'-')+'</option>').join('');
          if(!candidates.length){
            select.innerHTML='<option value="">Belum ada anggota BEM aktif</option>';
            select.disabled=true;
            if(button)button.disabled=true;
          }
        }else{
          const reason=data?.error||error?.message||'Gagal memuat kandidat.';
          select.innerHTML='<option value="">Gagal memuat kandidat</option>';
          select.disabled=true;
          if(button)button.disabled=true;
          console.error('BEM coordinator candidates failed:',{ukmId,reason});
          toast('Kandidat koordinator gagal dimuat: '+reason);
        }
      }catch(error){
        select.innerHTML='<option value="">Gagal memuat kandidat</option>';
        select.disabled=true;
        if(button)button.disabled=true;
        console.error('UKM coordinator candidate exception:',error);
        toast('Kandidat koordinator gagal dimuat.');
      }
    });
  }
}
function pesertaRow(reset, initialRows=[]) {
  const box=$('#ps');
  if(!box)return;
  if(reset)box.innerHTML='';

  const rows=initialRows.length?initialRows:[{}];
  const ownerId=String(S.detail?.proker?.organisasi_id||S.orgId||'');

  // Collaboration is organization-only. Budget details belong in the proposal.
  const options=(S.organizations||[])
    .filter(o=>
      ['BEM','UKM','HMJ'].includes(o.tipe) &&
      String(o.id)!==ownerId
    )
    .sort((a,b)=>String(a.nama).localeCompare(String(b.nama),'id'))
    .map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nama)+' · '+esc(o.tipe)+'</option>')
    .join('');

  rows.forEach(row=>{
    const statusLabel=row.status==='bergabung'?'Sudah bergabung'
      :row.status==='menolak'?'Menolak undangan'
      :row.status==='diundang'?'Menunggu undangan'
      :'Kolaborator baru';

    box.insertAdjacentHTML('beforeend',
      '<div class="peserta flex flex-col sm:flex-row gap-2 sm:items-center">'+
        '<select aria-label="Organisasi kolaborator" data-org-id class="flex-1">'+
          '<option value="">Pilih organisasi kolaborator</option>'+options+
        '</select>'+
        '<span class="chip bl text-center whitespace-nowrap">'+esc(statusLabel)+'</span>'+
        '<button type="button" class="btn d" data-del aria-label="Hapus kolaborator">×</button>'+
      '</div>'
    );

    const item=box.lastElementChild;
    const sel=item?.querySelector('[data-org-id]');
    if(sel && row.organisasi_id)sel.value=row.organisasi_id;
  });
}


function revokeActivityPhotoPreviews() {
  document.querySelectorAll('#activity-photo-preview img[data-object-url]').forEach(img=>{
    const url=img.dataset.objectUrl;
    if(url)URL.revokeObjectURL(url);
  });
}

function renderActivityPhotoSelection(files) {
  const preview=$('#activity-photo-preview');
  const status=$('#activity-photo-selection-status');
  const input=$('#activity-photo-input');
  const uploadBtn=document.querySelector('[data-activity-photo-upload]');
  if(!preview)return;

  revokeActivityPhotoPreviews();
  preview.innerHTML='';

  const list=[...(files||[])];
  const remaining=Math.max(0,5-Number(S.detail?.photos?.length||0));
  if(!list.length){
    if(status)status.textContent='Belum ada foto dipilih.';
    if(uploadBtn)uploadBtn.disabled=true;
    return;
  }

  const allowed=['image/jpeg','image/png','image/webp','image/gif'];
  const invalid=list.filter(f=>!allowed.includes(f.type)||f.size>10*1024*1024);
  const tooMany=list.length>remaining;
  const valid=!invalid.length&&!tooMany&&remaining>0;

  list.forEach(file=>{
    const url=URL.createObjectURL(file);
    preview.insertAdjacentHTML('beforeend',
      '<div class="overflow-hidden rounded-xl border border-slate-200 bg-white">'+
        '<img src="'+esc(url)+'" data-object-url="'+esc(url)+'" alt="'+esc(file.name)+'" class="w-full h-28 object-cover bg-slate-100">'+
        '<div class="p-2"><p class="text-xs font-semibold truncate" title="'+esc(file.name)+'">'+esc(file.name)+'</p>'+
        '<p class="text-[11px] text-slate-500">'+(file.size/1024/1024).toFixed(2)+' MB</p></div>'+
      '</div>'
    );
  });

  if(status){
    status.textContent=tooMany
      ? 'Terlalu banyak. Sisa slot hanya '+remaining+' foto.'
      : invalid.length
        ? 'Ada '+invalid.length+' file yang tidak memenuhi format atau batas 10 MB.'
        : list.length+' foto siap diunggah.';
    status.className=valid
      ? 'text-xs text-emerald-600 mt-2'
      : 'text-xs text-red-600 mt-2';
  }
  if(uploadBtn)uploadBtn.disabled=!valid;
  if(input)input.setAttribute('aria-invalid',String(!valid));
}

function updateActivityPhotoProgress(done,total,message) {
  const wrap=$('#activity-photo-progress');
  const bar=$('#activity-photo-progress-bar');
  const text=$('#activity-photo-progress-text');
  if(!wrap||!bar||!text)return;
  wrap.classList.remove('hidden');
  const pct=total>0?Math.min(100,Math.round((done/total)*100)):0;
  bar.style.width=pct+'%';
  text.textContent=message||('Mengunggah '+done+' dari '+total+' foto ('+pct+'%)');
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0,value) : 0;
  const digits=String(value??'').replace(/[^\d]/g,'');
  if(!digits)return 0;
  const n=Number(digits);
  return Number.isFinite(n) ? Math.max(0,n) : 0;
}

function formatMoney(value) {
  return 'Rp '+parseMoney(value).toLocaleString('id-ID');
}

function syncMoneyInput(el) {
  if(!el)return;
  const raw=String(el.value||'');
  const caret=Math.max(0,Math.min(Number(el.selectionStart??raw.length),raw.length));
  const digitsBefore=(raw.slice(0,caret).match(/\d/g)||[]).length;
  const digits=raw.replace(/[^\d]/g,'');
  if(!digits){
    if(raw!==''){
      el.value='';
      requestAnimationFrame(()=>{try{el.setSelectionRange(0,0);}catch(_){}});
    }
    return;
  }

  const formatted='Rp '+Number(digits).toLocaleString('id-ID');
  if(raw===formatted)return;
  el.value=formatted;

  let target=2;
  if(digitsBefore>0){
    let seen=0;
    for(let i=2;i<formatted.length;i++){
      target=i+1;
      if(/\d/.test(formatted[i])){
        seen++;
        if(seen>=digitsBefore)break;
      }
    }
  }
  requestAnimationFrame(()=>{try{el.setSelectionRange(target,target);}catch(_){}});
}


function totalPorsi() { return 0; }
function hitung() { return true; }


// --- Fungsi CSV ---
function parseCSVLine(line) {
  const out=[];let cur='';let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){cur+='"';i++;continue;}
      quoted=!quoted;continue;
    }
    if(ch===','&&!quoted){out.push(cur.trim());cur='';continue;}
    cur+=ch;
  }
  out.push(cur.trim());
  return out;
}

function bacaCSV(file) {
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const text=String(e.target.result||'').replace(/\r/g,'');
    const lines=text.split('\n').filter(x=>x.trim());
    const rows=lines.map(parseCSVLine).filter(r=>r.some(Boolean));
    S.csvData=rows;
    const preview=$('#csv-preview');
    if(preview)preview.innerHTML=rows.slice(0,50).map((r,i)=>'<div>'+esc((i+1)+'. '+(r[0]||'-')+' ('+(r[1]||'-')+') · '+(r[3]||'mahasiswa'))+'</div>').join('');
    const btn=$('#btn-csv');if(btn)btn.disabled=rows.length===0;
  };
  reader.readAsText(file,'utf-8');
}

async function prosesBulkCSV() {
  if(!sb)return toast('Supabase belum dikonfigurasi.');
  if(S.user.peran!=='admin')return toast('Hanya administrator yang boleh membuat akun.');
  let sukses=0,gagal=0;const credentials=[];
  for(const row of S.csvData){
    const [nama,email,nim,peran,organisasi_id,jabatan_kode,unit_id]=row;
    const effectiveRole=peran||'user';
    if(!email||!nama||(['user','mahasiswa'].includes(effectiveRole)&&!nim)){gagal++;continue;}
    try{
      const {data,error}=await sb.functions.invoke('admin-create-user',{body:{nama,email:email.trim().toLowerCase(),nim:nim||null,peran:effectiveRole,organisasi_id:effectiveRole==='dekan'?null:(organisasi_id||null),jabatan_kode:effectiveRole==='dekan'?null:(jabatan_kode||null),unit_id:effectiveRole==='dekan'?null:(unit_id||null)}});
      if(error||!data?.ok){console.error(error||data);gagal++;continue;}
      credentials.push({nama,email,temporary_password:data.temporary_password});sukses++;
    }catch(error){console.error(error);gagal++;}
  }
  S.lastCredentials=credentials;S.csvData=[];
  toast('Selesai: '+sukses+' sukses, '+gagal+' gagal.');
  if(credentials.length)console.table(credentials);
  return render();
}

// --- Event Listeners ---
