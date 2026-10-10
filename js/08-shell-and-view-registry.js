/* SIMA MHS: responsive shell, shared page helpers, and view registry. */

// --- Fungsi Render ---
function mobileMenuItems() {
  const navIcons={beranda:'home',proker:'folder',form:'plus',undangan:'mail',galeri:'image',laporan:'file',anggota:'users',struktur:'building',koordinator:'users',inbox:'mail',rapat:'calendar',plafon:'wallet',cair:'wallet',periode:'calendar',organisasi:'building',unit_kerja:'grid',akun:'users',jabatan:'settings',audit:'shield',profil:'user'};
  const groups = MENU
    .filter(([group]) => !(S.user.peran !== 'admin' && group === 'Admin'))
    .map(([group, items]) => [group, items.filter(([k]) => canAccessView(k))])
    .filter(([,items]) => items.length);
  return {groups,navIcons};
}

function closeMobileMoreMenu() {
  const panel=$('#mobileMoreMenu');
  if(panel){
    panel.classList.remove('open');
    document.body.classList.remove('mobile-menu-open');
    setTimeout(()=>panel.remove(),180);
  }
}

function openMobileMoreMenu() {
  closeMobileMoreMenu();
  const {groups,navIcons}=mobileMenuItems();
  const overlay=document.createElement('div');
  overlay.id='mobileMoreMenu';
  overlay.className='mobile-more-overlay';
  overlay.innerHTML=
    '<div class="mobile-more-backdrop" data-mobile-more-close></div>'+
    '<section class="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="Menu lainnya">'+
      '<div class="mobile-more-grab"></div>'+
      '<div class="mobile-more-head">'+
        '<div><p class="mobile-more-kicker">NAVIGASI</p><h2>Menu lainnya</h2></div>'+
        '<button type="button" class="mobile-more-close" data-mobile-more-close aria-label="Tutup">×</button>'+
      '</div>'+
      '<div class="mobile-more-scroll">'+
        groups.map(([group,items])=>
          '<section class="mobile-more-group"><p class="mobile-more-group-title">'+esc(group)+'</p>'+
          '<div class="mobile-more-list">'+
          items.map(([k,label])=>
            '<button type="button" class="mobile-more-item '+(S.view===k?'active':'')+'" data-mobile-more-go="'+esc(k)+'">'+
              '<span class="mobile-more-icon">'+icon(navIcons[k]||'grid')+'</span>'+
              '<span class="mobile-more-label">'+esc(label)+'</span>'+
              (S.view===k?'<span class="mobile-more-active-dot"></span>':'')+
            '</button>'
          ).join('')+
          '</div></section>'
        ).join('')+
        '<section class="mobile-more-group"><p class="mobile-more-group-title">Akun</p>'+
          '<div class="mobile-more-list"><button type="button" class="mobile-more-item '+(S.view==='profil'?'active':'')+'" data-mobile-more-go="profil">'+
            '<span class="mobile-more-icon">'+icon('user')+'</span><span class="mobile-more-label">Profil & organisasi</span>'+
            (S.view==='profil'?'<span class="mobile-more-active-dot"></span>':'')+
          '</button></div></section>'+
      '</div>'+
    '</section>';

  overlay.addEventListener('click',e=>{
    if(e.target.closest('[data-mobile-more-close]')){closeMobileMoreMenu();return;}
    const item=e.target.closest('[data-mobile-more-go]');
    if(item){
      const view=item.dataset.mobileMoreGo;
      closeMobileMoreMenu();
      requestAnimationFrame(()=>navigate(view));
    }
  });
  document.body.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('open'));
  document.body.classList.add('mobile-menu-open');
}

function renderShell() {
  if (!$('#app') || !$('#nav') || !$('#bn') || !$('#cx') || !$('#notifBtn') || !$('#backBtn')) return;
  if(S.authLost && !S.user.id){
    $('#app').hidden=true;
    $('#login').hidden=false;
    return;
  }

  if (S.user.wajib_ganti_sandi) {
    $('#nav').innerHTML = '';
    $('#bn').innerHTML = '';
  } else {
    const visibleGroups = S.user.peran === 'admin'
      ? MENU.filter(([g]) => g === 'Admin')
      : MENU.filter(([g]) => g !== 'Admin');

    $('#nav').innerHTML = visibleGroups.map(([g, it]) => {
      const allowed = it.filter(([k]) => canAccessView(k));
      if (!allowed.length) return '';
      return '<div class="mt-5 mb-1 px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + esc(g) + '</div>' +
        allowed.map(([k, t]) => {
          const navIcons={beranda:'home',proker:'folder',form:'plus',undangan:'mail',galeri:'image',laporan:'file',struktur:'building',inbox:'mail',rapat:'calendar',plafon:'wallet',cair:'wallet',anggota:'users',periode:'calendar',organisasi:'building',unit_kerja:'grid',akun:'users',jabatan:'settings',audit:'shield',koordinator:'users',profil:'user'};
          return '<button class="nav" data-go="' + esc(k) + '" data-active="' + (S.view===k ? 'true' : 'false') + '" aria-current="' + (S.view===k ? 'page' : 'false') + '">' +
            '<span class="nav-ico">' + icon(navIcons[k]||'grid') + '</span><span class="nav-label">' + esc(t) + '</span>' +
          '</button>';
        }).join('');
    }).join('');

    const mobile = [
      ['beranda','Beranda','home'],
      ['proker','Proker','folder'],
      ['inbox','Review','mail'],
      ['__more__','Lainnya','grid'],
      ['form','Tambah','plus']
    ].filter(([k]) => k==='__more__' || canAccessView(k));
    $('#bn').innerHTML = mobile.map(([k,t,ico]) => {
      if(k==='__more__'){
        return '<button class="bn-more" type="button" data-mobile-more aria-label="Menu lainnya"><span class="bn-icon">'+icon(ico)+'</span><span> Lainnya</span></button>';
      }
      const active=S.view===k;
      return '<button class="'+(k==='form'?'bn-plus':'bn-item '+(active?'on':''))+'" type="button" data-go="'+esc(k)+'" aria-label="'+esc(t)+'">'+
        '<span class="bn-icon">'+icon(ico)+'</span><span>'+esc(t)+'</span></button>';
    }).join('');
  }

  $('#cx').innerHTML = (S.ctxs || []).map((ctx, i) =>
    '<option value="' + i + '" ' + (i === S.ctx ? 'selected' : '') + '>' +
      esc(ctx.org + ' · ' + ctx.peran) +
    '</option>'
  ).join('');

  $('#notifBtn').innerHTML = icon('bell');
  $('#notifBtn').querySelector('svg')?.classList.add('w-5','h-5');

  const back = $('#backBtn');
  back.innerHTML = icon('back');
  back.className = 'h-10 w-10 shrink-0 rounded-xl bg-white border border-slate-200 shadow-sm grid place-items-center hover:bg-slate-50 transition';
  back.querySelector('svg')?.classList.add('w-5','h-5');
  back.hidden = S.view === 'beranda' || S.view === 'ganti_sandi' || S.history.length === 0;

  const av = $('#av');
  if (av) av.innerHTML = avatarMarkup(S.user);

  renderNotificationPanel();
  renderProfileMenu();
}



function pageHeader(title, desc, action) {
  return '<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">' +
    '<div><h1 class="t">' + esc(title) + '</h1><p class="sub">' + esc(desc) + '</p></div>' +
    (action || '') + '</div>';
}
function emptyCard(message, action) {
  return '<div class="card text-center py-10"><p class="sub">' + esc(message) + '</p>' + (action || '') + '</div>';
}
function dateID(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
}
function dateTimeID(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('id-ID',{
    day:'2-digit',
    month:'short',
    year:'numeric',
    hour:'2-digit',
    minute:'2-digit'
  });
}
const UNIT_TYPE_LABELS = {
  presiden:'Presiden',
  wakil_presiden:'Wakil Presiden',
  sekretaris:'Sekretaris',
  bendahara:'Bendahara',
  ketua:'Ketua',
  wakil_ketua:'Wakil Ketua',
  kementerian:'Kementerian',
  divisi:'Divisi'
};
function unitTypeLabel(type){ return UNIT_TYPE_LABELS[type] || type || '-'; }

function roleChip(role) {
  const labels={admin:'Admin',wakil_rektor:'Wakil Rektor',pembimbing:'Pembimbing',staf_keuangan:'Keuangan',mahasiswa:'Mahasiswa'};
  return '<span class="chip bl">' + esc(labels[role] || role || '-') + '</span>';
}
function orgOptions(selected) {
  return (S.organizations||[]).map(o =>
    '<option value="' + esc(o.id) + '" ' + (String(selected||'')===String(o.id)?'selected':'') + '>' +
    esc(o.nama + ' · ' + o.tipe) + '</option>'
  ).join('');
}


const V = {};
