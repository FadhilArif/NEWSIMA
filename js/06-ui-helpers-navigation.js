/* SIMA MHS: HTML helpers, profile/menu navigation, and client-side state. */

const chip = s => { const [t, c] = ST[s] || [s, '']; return `<span class="chip ${c}">${t}</span>`; };

const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ICON = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 18-6-6 6-6"/><path d="M9 12h9"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.2 3.3-5 7-5s6.1 1.8 7 5"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-5"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14.5 6.5 3 3"/><path d="M4 20l4.3-.9L19 8.4a2.1 2.1 0 0 0 0-3l-.4-.4a2.1 2.1 0 0 0-3 0L4.9 15.7 4 20Z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m5 12 4 4L19 6"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 16-5-5-7 7"/></svg>',
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.8M18 14c1.8.8 2.8 2.5 3 5"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V5l8-2v18M12 7h8v14M7 7h2M7 11h2M7 15h2M15 11h2M15 15h2M15 19h2"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h15a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"/><path d="M16 13h5M17 13h.01"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .35 1.98l.05.05-1.7 1.7-.05-.05a1.8 1.8 0 0 0-1.98-.35 1.8 1.8 0 0 0-1.1 1.65V20h-2.4v-.07a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.35l-.05.05-1.7-1.7.05-.05A1.8 1.8 0 0 0 7.1 15a1.8 1.8 0 0 0-1.65-1.1H5.4v-2.4h.05A1.8 1.8 0 0 0 7.1 10a1.8 1.8 0 0 0-.35-1.98L6.7 7.97l1.7-1.7.05.05A1.8 1.8 0 0 0 10.43 6a1.8 1.8 0 0 0 1.1-1.65V4h2.4v.35A1.8 1.8 0 0 0 15 6a1.8 1.8 0 0 0 1.98-.35l.05-.05 1.7 1.7-.05.05A1.8 1.8 0 0 0 18.9 10a1.8 1.8 0 0 0 1.65 1.1h.05v2.4h-.05A1.8 1.8 0 0 0 19.4 15Z"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 20 6v5c0 5-3.2 8.5-8 10-4.8-1.5-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 3 5-7"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>'
};
const icon = name => ICON[name] || '';

function avatarMarkup(u, cls='h-10 w-10') {
  const url = u?.avatar_url || '';
  const initials = esc((u?.nama || 'A').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase());
  return url
    ? '<img src="' + esc(url) + '" alt="Foto profil" class="' + cls + ' rounded-full object-cover border border-slate-200">'
    : '<span class="' + cls + ' rounded-full bg-sima-600 text-white font-bold grid place-items-center">' + initials + '</span>';
}

function profileKey() {
  return 'sima:profile:' + String(S.user.email || 'demo').toLowerCase();
}

function loadLocalProfile() {
  if (sb) return;
  try {
    const raw = localStorage.getItem(profileKey());
    if (!raw) return;
    const p = JSON.parse(raw);
    S.user = { ...S.user, ...p };
  } catch (_) {}
}

function saveLocalProfile() {
  if (sb) return;
  try {
    localStorage.setItem(profileKey(), JSON.stringify({
      nama:S.user.nama, nim:S.user.nim || '', avatar_url:S.user.avatar_url || ''
    }));
  } catch (_) {}
}

function navigate(view, push=true) {
  if (!view) return render();

  // Notification deep-link support: review:<proker_id>
  if (typeof view === 'string' && view.startsWith('review:')) {
    const prokerId = view.slice('review:'.length).trim();
    if (prokerId) S.selectedProkerId = prokerId;
    view = 'review';
  }

  if (view === S.view) return render({force:true});
  if (!canAccessView(view)) {
    toast('Akses ditolak untuk role ' + roleLabel(S.user?.peran));
    return;
  }
  if (push) S.history.push(S.view);
  S.view = view;
  render();
}

function goBack() {
  const previous = S.history.pop();
  const fallback = S.user?.peran === 'admin' ? 'organisasi' : 'beranda';
  S.view = previous && canAccessView(previous) ? previous : fallback;
  render();
}

function resetClientState() {
  if (S.notificationChannel && sb) {
    sb.removeChannel(S.notificationChannel).catch(error => console.warn('Gagal melepas channel notifikasi:', error));
    S.notificationChannel = null;
  }
  S.user={nama:'',email:'',nim:'',avatar_url:'',wajib_ganti_sandi:false};
  S.authLost=true;
  S.ctx=0;S.ctxs=[];S.view='beranda';S.tab='semua';S.q='';S.orgId=null;S.permissions=new Set();S.positions=[];S.permissionMatrix={};S.positionsLoaded=false;S.structureOrgId=null;S.organizationRelations=[];S.coordinatorAssignments=[];S.clubMembers=[];S.revealedCredential=null;S.storageStatus=null;
  S.history=[];S.notifications=[];S.memberships=[];S.organizations=[];S.pendingAvatarFile=null;
  S.proker=[];S.fundUsageProkers=[];S.detail=null;S.selectedProkerId=null;S.editProkerId=null;S.reviewDocId=null;
  S.undangan=[];S.inbox=[];S.gallery=[];S.reports=[];S.structure=[];S.meetings=[];S.budgets=[];S.approvedCampusProkers=[];S.payouts=[];S.periods=[];S.audit=[];S.accounts=[];S.sources=[];S.units=[];S.anggota=[];S.anggotaPeriodId=null;S.anggotaQ='';
  S.csvData=[];S.lastCredentials=[];S.tempSb=null;S.renderToken++;
  S.activityThumbUrlCache=new Map();S.coordinatorAssignmentsLoadedAt=0;S.coordinatorAssignmentsCacheKey='';
  S.notificationsLoadedAt=0;S.notificationsLoadPromise=null;
S.viewCache={};
S.viewCacheTtl=15000;
S.htmlCache={};
S.htmlCacheTtl=12000;
S.htmlCache={};
S.htmlCacheTtl=12000;
  $('#fl')?.reset();
  $('#v')?.replaceChildren();
  $('#nav')?.replaceChildren();
  $('#bn')?.replaceChildren();
  if($('#notifPanel'))$('#notifPanel').hidden=true;
  if($('#profileMenu'))$('#profileMenu').hidden=true;
  if($('#notifBadge')){ $('#notifBadge').textContent='0'; $('#notifBadge').hidden=true; }
}

function renderNotificationPanel() {
  const panel = $('#notifPanel'), badge = $('#notifBadge');
  if (!panel || !badge) return;
  const unread = S.notifications.filter(n => !n.read).length;
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
  panel.innerHTML = '<div class="p-4 border-b border-slate-100 flex items-center justify-between gap-3">' +
    '<div><p class="font-bold text-sm">Notifikasi</p><p class="text-xs text-slate-500">' +
    (unread ? unread + ' belum dibaca' : 'Semua sudah dibaca') + '</p></div>' +
    '<button data-notif="read-all" class="text-xs font-semibold text-sima-600 hover:underline">Tandai semua</button></div>' +
    (S.notifications.length ? '<div class="max-h-80 overflow-y-auto">' + S.notifications.map(n =>
      '<button data-notif="open" data-id="' + esc(n.id) + '" class="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex gap-3 ' + (n.read ? '' : 'bg-sima-50/50') + '">' +
      '<span class="mt-1 h-2.5 w-2.5 rounded-full shrink-0 ' + (n.read ? 'bg-slate-200' : 'bg-red-500') + '"></span>' +
      '<span class="min-w-0"><span class="block text-sm font-semibold truncate">' + esc(n.title) + '</span>' +
      '<span class="block text-xs text-slate-500 mt-0.5">' + esc(n.message) + '</span></span></button>'
    ).join('') + '</div>' : '<div class="p-8 text-center text-sm text-slate-500">Belum ada notifikasi.</div>');
}

function openDeleteProkerModal(proker) {
  return new Promise(resolve=>{
    const existing=$('#deleteProkerModal');
    if(existing)existing.remove();

    const modal=document.createElement('div');
    modal.id='deleteProkerModal';
    modal.className='fixed inset-0 z-[120] bg-slate-950/70 p-4 sm:p-6 flex items-center justify-center';
    modal.innerHTML=
      '<div class="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">'+
        '<div class="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">'+
          '<div>'+
            '<p class="text-xs font-semibold uppercase tracking-wide text-red-600">Penghapusan permanen</p>'+
            '<h2 class="text-xl font-bold mt-1 text-slate-900">Hapus Proker?</h2>'+
          '</div>'+
          '<button type="button" data-delete-close class="h-9 w-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xl" aria-label="Tutup">×</button>'+
        '</div>'+
        '<div class="p-5 space-y-4">'+
          '<div class="rounded-2xl border border-red-200 bg-red-50 p-4">'+
            '<p class="font-semibold text-red-800">'+esc(proker?.nama||'Proker')+'</p>'+
            '<p class="text-sm text-red-700 mt-1">Tindakan ini akan menghapus Proker beserta dokumen, riwayat persetujuan, rincian anggaran, relasi kolaborator, dokumentasi, dan data terkait.</p>'+
            '<p class="text-sm font-semibold text-red-800 mt-2">Penghapusan bersifat permanen dan tidak dapat dibatalkan.</p>'+
          '</div>'+
          '<div>'+
            '<label class="font-semibold">Ketik <span class="text-red-600">HAPUS</span> untuk melanjutkan</label>'+
            '<input id="delete-proker-confirm-input" autocomplete="off" spellcheck="false" class="mt-2 uppercase" placeholder="Ketik HAPUS">'+
            '<p id="delete-proker-confirm-help" class="text-xs text-slate-500 mt-2">Tombol hapus akan aktif setelah Anda mengetik HAPUS dengan tepat.</p>'+
          '</div>'+
        '</div>'+
        '<div class="px-5 py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">'+
          '<button type="button" data-delete-cancel class="btn">Batal</button>'+
          '<button type="button" data-delete-confirm class="btn d" disabled>Hapus permanen</button>'+
        '</div>'+
      '</div>';

    const cleanup=value=>{
      modal.remove();
      resolve(!!value);
    };

    const input=modal.querySelector('#delete-proker-confirm-input');
    const confirmBtn=modal.querySelector('[data-delete-confirm]');

    const updateState=()=>{
      const ok=String(input?.value||'').trim().toUpperCase()==='HAPUS';
      if(confirmBtn)confirmBtn.disabled=!ok;
      const help=modal.querySelector('#delete-proker-confirm-help');
      if(help){
        help.textContent=ok
          ? 'Konfirmasi valid. Penghapusan akan dilakukan permanen.'
          : 'Tombol hapus akan aktif setelah Anda mengetik HAPUS dengan tepat.';
        help.className=ok
          ? 'text-xs text-red-600 mt-2 font-semibold'
          : 'text-xs text-slate-500 mt-2';
      }
    };

    modal.addEventListener('input',e=>{
      if(e.target===input)updateState();
    });

    modal.addEventListener('click',e=>{
      if(e.target===modal || e.target.closest('[data-delete-close]') || e.target.closest('[data-delete-cancel]')){
        cleanup(false);
        return;
      }
      if(e.target.closest('[data-delete-confirm]')){
        updateState();
        if(!confirmBtn.disabled)cleanup(true);
      }
    });

    modal.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        e.preventDefault();
        cleanup(false);
      }
      if(e.key==='Enter' && document.activeElement===input){
        updateState();
        if(!confirmBtn.disabled){
          e.preventDefault();
          cleanup(true);
        }
      }
    });

    document.body.append(modal);
    requestAnimationFrame(()=>input?.focus());
  });
}

function closeActivityGallery() {
  const modal=$('#activityGalleryModal');
  if(modal)modal.remove();
}

async function openActivityGallery(prokerId) {
  const album=(S.gallery||[]).find(x=>String(x.proker_id)===String(prokerId));
  if(!album)return toast('Album kegiatan tidak ditemukan.');
  closeActivityGallery();

  const modal=document.createElement('div');
  modal.id='activityGalleryModal';
  modal.className='fixed inset-0 z-[100] bg-slate-950/80 p-4 sm:p-6 overflow-y-auto';
  modal.innerHTML='<div class="min-h-full flex items-start justify-center py-4 sm:py-8"><div class="w-full max-w-6xl rounded-3xl bg-white shadow-2xl overflow-hidden"><div class="px-5 py-4 flex items-center justify-between gap-4"><div><p class="text-xs font-semibold uppercase tracking-wide text-sima-600">Dokumentasi kegiatan</p><h2 class="text-xl font-bold mt-1">'+esc(album.proker?.nama||'Kegiatan')+'</h2></div><button type="button" data-gallery-close class="h-10 w-10 rounded-xl border border-slate-200 text-slate-600 text-xl" aria-label="Tutup">×</button></div><div class="p-6 text-sm text-slate-500">Memuat foto album…</div></div></div>';
  modal.addEventListener('click',event=>{
    if(event.target===modal || event.target.closest('[data-gallery-close]'))closeActivityGallery();
  });
  document.body.append(modal);

  const urls=await getActivityThumbnailUrls(album.photos.map(photo=>photo.thumb_path));
  if(!document.body.contains(modal))return;
  album.photos=album.photos.map(photo=>({...photo,thumb_url:photo.thumb_path?(urls.get(photo.thumb_path)||'') : ''}));
  album.cover=album.photos.find(photo=>String(photo.id)===String(album.cover?.id))||album.photos[0]||null;

  modal.innerHTML=
    '<div class="min-h-full flex items-start justify-center py-4 sm:py-8">'+
      '<div class="w-full max-w-6xl rounded-3xl bg-white shadow-2xl overflow-hidden">'+
        '<div class="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4">'+
          '<div class="min-w-0"><p class="text-xs font-semibold uppercase tracking-wide text-sima-600">Dokumentasi kegiatan</p>'+
            '<h2 class="text-xl font-bold mt-1 truncate">'+esc(album.proker?.nama||'Kegiatan')+'</h2>'+
            '<p class="text-sm text-slate-500 mt-1">'+album.photos.length+' foto</p></div>'+
          '<button type="button" data-gallery-close class="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 grid place-items-center text-slate-600 text-xl" aria-label="Tutup">×</button>'+
        '</div>'+
        '<div class="p-4 sm:p-6"><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">'+
          album.photos.map(photo=>
            '<div class="rounded-2xl border border-slate-200 overflow-hidden bg-white">'+
              (photo.thumb_url
                ? '<img loading="lazy" decoding="async" src="'+esc(photo.thumb_url)+'" alt="'+esc(photo.file_name||'Foto kegiatan')+'" class="w-full h-56 object-cover bg-slate-100">'
                : '<div class="w-full h-56 bg-slate-100 grid place-items-center text-slate-400">Pratinjau tidak tersedia</div>')+
              '<div class="p-3"><p class="font-semibold text-sm break-words">'+esc(photo.file_name||'Foto kegiatan')+'</p>'+
                '<p class="text-xs text-slate-500 mt-1">'+dateTimeID(photo.uploaded_at||'')+'</p>'+
                '<p class="text-xs text-slate-500">Oleh: '+esc(photo.uploader?.nama||photo.diunggah_oleh||'-')+'</p>'+
                '<p class="text-xs text-sima-700 font-semibold mt-1">Organisasi: '+esc(photo.uploader_organization?.nama||'Tidak terdeteksi')+'</p></div></div>'
          ).join('')+
        '</div></div></div></div>';
}

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    closeActivityGallery();
    closeMobileMoreMenu();
  }
});

function renderProfileMenu() {
  const m = $('#profileMenu');
  if (!m) return;
  const memberships=(S.memberships||[]).map(m=>{
    const org=(S.organizations||[]).find(o=>String(o.id)===String(m.organisasi_id));
    return '<div class="profile-org-row"><span class="profile-org-dot"></span><span><b>'+esc(org?.nama||'Organisasi')+'</b><small>'+esc(m.jabatan||'Anggota')+'</small></span></div>';
  }).join('');
  m.innerHTML =
    '<div class="profile-popover-head">' +
      '<div class="profile-popover-avatar">' + avatarMarkup(S.user,'h-16 w-16') + '</div>' +
      '<div class="min-w-0"><p class="profile-popover-name">' + esc(S.user.nama || 'Pengguna') + '</p>' +
      '<p class="profile-popover-role">' + esc(roleLabel(S.user.peran)) + '</p>' +
      '<p class="profile-popover-email">' + esc(S.user.email || '') + '</p></div>' +
    '</div>' +
    '<div class="profile-popover-body">' +
      '<div class="profile-popover-section"><span>ORGANISASI AKTIF</span>' + (memberships || '<p class="profile-empty">Belum ada organisasi.</p>') + '</div>' +
      '<div class="profile-popover-actions">' +
        '<button data-profile-action="profile" class="profile-action">' + icon('user') + '<span>Profil & organisasi</span></button>' +
        '<button data-profile-action="logout" class="profile-action danger">' + icon('logout') + '<span>Keluar dari akun</span></button>' +
      '</div>' +
    '</div>';
  m.querySelectorAll('svg').forEach(x => x.classList.add('w-5','h-5','shrink-0'));
}

