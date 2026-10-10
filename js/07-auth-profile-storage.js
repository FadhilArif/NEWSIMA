/* SIMA MHS: authentication lifecycle, profile handling, and file-upload helpers. */

async function hydrateUser(authUser) {
  const userId=String(authUser?.id||'');
  if(!userId)return;
  const active=S.hydrateUserPromise;
  if(active && active.userId===userId)return active.promise;
  const promise=hydrateUserOnce(authUser);
  S.hydrateUserPromise={userId,promise};
  try{
    return await promise;
  }finally{
    if(S.hydrateUserPromise?.promise===promise)S.hydrateUserPromise=null;
  }
}

async function hydrateUserOnce(authUser) {
  let profile = {};
  if (sb) {
    const { data } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
    profile = data || {};
  }
  if (!profile || !profile.aktif) {
    await sb?.auth.signOut();
    resetClientState();
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#le').textContent = 'Akun tidak aktif. Hubungi administrator.';
    return;
  }

  const role = profile.peran || '';
  if (!ROLE_ACCESS[role]) {
    await sb?.auth.signOut();
    resetClientState();
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#le').textContent = 'Akun tidak memiliki role yang valid. Hubungi administrator.';
    return;
  }

  S.authLost=false;
  S.user = {
    id: authUser.id,
    nama: profile.nama || authUser.user_metadata?.nama || authUser.email?.split('@')[0] || 'Pengguna',
    email: profile.email || authUser.email || '',
    nim: profile.nim || authUser.user_metadata?.nim || '',
    peran: role,
    avatar_url: profile.avatar_url || authUser.user_metadata?.avatar_url || '',
    wajib_ganti_sandi: !!profile.wajib_ganti_sandi,
    unit_kerja_id: profile.unit_kerja_id || null
  };
  if (!sb) loadLocalProfile();

  // Clear the previous identity BEFORE building the new account context.
  // loadContexts() populates memberships, organizations, permissions and orgId.
  S.history = [];
  S.htmlCache = {};
  S.viewCache = {};
  S.notifications = [];
  S.memberships = [];
  S.organizations = [];
  S.positions = [];
  S.permissions = new Set();
  S.positionsLoaded = false;
  S.proker = [];
  S.ctxs = [];
  S.ctx = 0;
  S.tab = 'semua';
  S.q = '';
  S.orgId = null;
  S.pendingAvatarFile = null;
  S.selectedProkerId = null;
  S.structureOrgId = null;
  S.organizationRelations = [];
  S.coordinatorAssignments = [];
  S.coordinatorAssignmentsLoadedAt=0;S.coordinatorAssignmentsCacheKey='';
  S.activityThumbUrlCache=new Map();S.notificationsLoadedAt=0;S.notificationsLoadPromise=null;
  S.clubMembers = [];
  S.revealedCredential = null;

  // Build the new account-scoped organization context after the old identity
  // has been completely cleared.
  await loadContexts();

  // Notification inbox is account-scoped and should be available on every page.
  await setupNotificationRealtime();

  $('#login').hidden = true;
  $('#app').hidden = false;
  if (S.user.wajib_ganti_sandi) {
    S.view = 'ganti_sandi';
  } else if (S.user.peran === 'admin') {
    S.view = 'organisasi';
  } else {
    S.view = 'beranda';
  }

  // First paint immediately; view data is loaded asynchronously by render().
  render();

  // Storage meter is informational and should never block first paint.
  if(S.user.peran==='admin'){
    loadStorageStatus().catch(error=>console.warn('Storage status gagal dimuat:',error));
  }

}

async function logout() {
  S.intentionalSignOut=true;
  if (sb) {
    const { error } = await sb.auth.signOut({ scope:'local' });
    if (error) {
      S.intentionalSignOut=false;
      return toast('Gagal keluar: ' + error.message);
    }
  }
  clearLegacyAuthStorage();
  AUTH_STORAGE.removeItem(AUTH_STORAGE_KEY);
  resetClientState();
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#le').textContent = '';
  toast('Anda telah keluar dari akun.');
}

async function saveProfile(e) {
  e.preventDefault();
  const nama = $('#profileName').value.trim();
  const nim = $('#profileNim').value.trim();
  if (!nama) return toast('Nama wajib diisi.');
  S.user.nama = nama; S.user.nim = nim;

  if (!sb) {
    if (S.pendingAvatarFile) {
      const reader = new FileReader();
      reader.onload = () => { S.user.avatar_url = reader.result; saveLocalProfile(); render(); toast('Profil berhasil diperbarui.'); };
      reader.readAsDataURL(S.pendingAvatarFile);
    } else {
      saveLocalProfile(); render(); toast('Profil berhasil diperbarui.');
    }
    return;
  }

  const profilePayload = { nama, nim };
  const p = await sb.from('profiles').update(profilePayload).eq('id', S.user.id);
  if (p.error) {
    const meta = await sb.auth.updateUser({ data:{ ...(S.user.id ? {} : {}), nama, nim } });
    if (meta.error) return toast('Nama/NIM gagal disimpan: ' + p.error.message);
  }

  if (S.pendingAvatarFile) {
    const file = S.pendingAvatarFile;
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = S.user.id + '/' + Date.now() + '.' + ext;
    const quota=await loadStorageStatus(file.size);
    if(quota && !quota.can_upload){
      S.pendingAvatarFile=null;
      return toast('Penyimpanan SIMA penuh. Upload foto dihentikan agar tidak melewati batas aman.');
    }
    const up = await sb.storage.from('avatars').upload(path, file, { upsert:true, contentType:file.type || 'image/jpeg' });
    if (!up.error) {
      const pub = sb.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = pub.data?.publicUrl || '';
      S.user.avatar_url = avatarUrl;
      const av = await sb.from('profiles').update({ avatar_url:avatarUrl }).eq('id', S.user.id);
      if (av.error) await sb.auth.updateUser({ data:{ avatar_url:avatarUrl } });
    } else {
      toast('Nama/NIM tersimpan, tetapi foto gagal diunggah. Pastikan bucket Storage "avatars" tersedia.');
    }
  }
  S.pendingAvatarFile = null;
  await loadMemberships();
  await loadStorageStatus();
  render();
  if(S.storageStatus?.warning) toast('Peringatan: storage SIMA sudah mencapai 900 MB atau lebih.');
  else toast('Profil berhasil diperbarui.');
}

function previewAvatar(file) {
  S.pendingAvatarFile = file || null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = $('#profileAvatarPreview');
    if (img) img.innerHTML = '<img src="' + e.target.result + '" alt="Pratinjau foto" class="h-24 w-24 rounded-3xl object-cover border border-slate-200">';
  };
  reader.readAsDataURL(file);
}

function clearLegacyAuthStorage() {
  try {
    const currentKey=AUTH_STORAGE_KEY;
    const legacyLocalKeys=[
      'sb-xmlkuhmrpqurljlvmwfl-auth-token',
      'sima.auth.v1',
      'sima.auth.v2'
    ];
    legacyLocalKeys.forEach(key=>{
      localStorage.removeItem(key);
    });

    // Clean any abandoned v1/v2 session in the current tab, but never touch
    // the active v3 tab session.
    ['sima.auth.v1','sima.auth.v2'].forEach(key=>{
      if(key!==currentKey) AUTH_STORAGE.removeItem(key);
    });
  } catch (error) {
    console.warn('Legacy auth storage cleanup skipped:',error);
  }
}

async function getUploadAccessToken(){
  if(S.lastKnownSession?.access_token)return S.lastKnownSession.access_token;
  if(!sb)throw new Error('Supabase belum tersedia.');
  const {data,error}=await sb.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Sesi akun tidak tersedia. Silakan masuk kembali.');
  S.lastKnownSession=data.session;
  return data.session.access_token;
}

async function uploadStorageFile(bucketName,path,file,options={}){
  if(!sb)throw new Error('Supabase belum tersedia.');
  const contentType=options.contentType||file.type||'application/octet-stream';
  const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
  if(file.size<=RESUMABLE_UPLOAD_THRESHOLD || !window.tus || !SUPABASE_STORAGE_URL){
    const up=await sb.storage.from(bucketName).upload(path,file,{upsert:false,contentType});
    if(up.error)throw up.error;
    onProgress?.(file.size,file.size);
    return up;
  }
  const accessToken=await getUploadAccessToken();
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;fn(value);};
    const upload=new window.tus.Upload(file,{
      endpoint:SUPABASE_STORAGE_URL+'/storage/v1/upload/resumable',
      retryDelays:UPLOAD_RETRY_DELAYS,
      headers:{authorization:'Bearer '+accessToken,'x-upsert':'false'},
      metadata:{bucketName,objectName:path,contentType,cacheControl:'3600'},
      chunkSize:RESUMABLE_UPLOAD_THRESHOLD,
      uploadDataDuringCreation:true,
      removeFingerprintOnSuccess:true,
      onError:error=>finish(reject,error||new Error('Resumable upload gagal.')),
      onProgress:(uploaded,total)=>onProgress?.(uploaded,total),
      onSuccess:()=>finish(resolve,{data:{path},error:null})
    });
    upload.start();
  });
}

async function withUploadLock(label,task){
  const previous=S.uploadLockPromise||Promise.resolve();
  let releaseResolve;
  const current=new Promise(resolve=>{releaseResolve=resolve;});
  S.uploadLockPromise=current;

  if(previous!==current){
    try{
      await previous;
    }catch(_){}
  }

  try{
    return await task();
  }finally{
    releaseResolve();
    if(S.uploadLockPromise===current)S.uploadLockPromise=null;
  }
}

async function mapWithConcurrency(items,limit,worker){
  const results=new Array(items.length);
  let nextIndex=0;
  async function runner(){
    while(true){
      const index=nextIndex++;
      if(index>=items.length)return;
      results[index]=await worker(items[index],index);
    }
  }
  const workers=Array.from({length:Math.min(Math.max(1,limit),items.length)},()=>runner());
  await Promise.all(workers);
  return results;
}

async function recoverAuthSession(reason='unknown'){
  if(!sb)return {ok:false,reason:'no_client'};
  if(S.authRecoveryPromise)return S.authRecoveryPromise;

  S.authRecoveryPromise=(async()=>{
    try{
      const sessionRes=await sb.auth.getSession();
      if(sessionRes.error){
        const status=Number(sessionRes.error.status||0);
        if(status===429)return {ok:false,rateLimited:true,reason:'get_session_rate_limited'};
        return {ok:false,reason:sessionRes.error.message||'get_session_failed'};
      }

      const session=sessionRes.data?.session;
      if(session?.user){
        const expiresAt=Number(session.expires_at||0)*1000;
        if(!expiresAt || expiresAt>Date.now()+30000){
          return {ok:true,session};
        }
      }

      // The Supabase client owns refresh scheduling. Never create a second
      // manual refresh loop here; that can hit the token endpoint rate limit.
      return {ok:false,reason:'no_active_session'};
    }catch(error){
      console.warn('Auth recovery gagal:',reason,error);
      return {ok:false,reason:error?.message||'recovery_exception'};
    }finally{
      S.authRecoveryPromise=null;
    }
  })();

  return S.authRecoveryPromise;
}

async function handleTransientAuthError(error,context='request'){
  const status=Number(error?.status||error?.code||0);
  if(status!==401)return {retry:false,sessionValid:true};

  const recovered=await recoverAuthSession(context);
  if(recovered.ok)return {retry:true,sessionValid:true};

  if(recovered.rateLimited){
    toast('Auth sedang dibatasi sementara. Sesi tidak dikeluarkan; coba lagi sesaat.');
    return {retry:false,sessionValid:true,rateLimited:true};
  }

  return {retry:false,sessionValid:false,reason:recovered.reason||'no_active_session'};
}

async function initAuth() {
  if (!sb) {
    $('#login').hidden = false;
    $('#app').hidden = true;
    $('#le').textContent = 'Login dinonaktifkan sampai SUPABASE_URL dan SUPABASE_ANON_KEY/PUBLISHABLE_KEY dikonfigurasi.';
    renderShell();
    return;
  }

  try {
    clearLegacyAuthStorage();
    const { data, error } = await sb.auth.getSession();

    if (error) {
      console.warn('Sesi lokal tidak dapat dipulihkan:', error.message);
      await sb.auth.signOut({ scope:'local' }).catch(()=>{});
    } else if (data?.session?.user) {
      S.lastKnownSession=data.session;
      // Validate the persisted access token before hydrating the application.
      // If Auth rejects it, clear the local session instead of rendering a
      // blank identity with stale UI state.
      const { data:userCheck, error:userCheckError } = await sb.auth.getUser();
      if (userCheckError || !userCheck?.user) {
        console.warn('Session tersimpan tidak valid:', userCheckError?.message || 'Auth user tidak tersedia.');
        await sb.auth.signOut({ scope:'local' }).catch(()=>{});
        S.authLost=true;
        $('#app').hidden=true;
        $('#login').hidden=false;
      } else {
        await hydrateUser(userCheck.user);
      }
    } else {
      S.authLost=true;
      $('#app').hidden=true;
      $('#login').hidden=false;
    }
  } catch (error) {
    console.warn('Pemulihan sesi gagal:', error);
    await sb.auth.signOut({ scope:'local' }).catch(()=>{});
    S.authLost=true;
    $('#app').hidden=true;
    $('#login').hidden=false;
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if(session)S.lastKnownSession=session;
      if (session?.user && S.authLost) {
        hydrateUser(session.user).catch(error=>console.warn('Hydrate setelah auth event gagal:',error));
      }
    } else if (event === 'SIGNED_OUT') {
      if(S.intentionalSignOut)return;
      resetClientState();
      $('#app').hidden=true;
      $('#login').hidden=false;
      $('#le').textContent='Sesi akun berakhir. Silakan masuk kembali.';
    }
  });
}

function getTempSb() {
  if (!S.tempSb) {
    S.tempSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { 
      auth: { persistSession: false, autoRefreshToken: false } 
    });
  }
  return S.tempSb;
}
