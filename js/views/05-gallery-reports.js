/* Page renderers: activity gallery and final reports. */

V.galeri = function(){
    return pageHeader('Galeri kegiatan','Satu album untuk setiap program kerja. Klik thumbnail untuk melihat seluruh foto.')+
      (S.gallery.length
        ? '<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">'+
          S.gallery.map(x=>
            '<button type="button" class="card !p-0 overflow-hidden text-left group hover:-translate-y-0.5 transition" data-gallery-proker="'+esc(x.proker_id)+'">'+
              (x.cover?.thumb_url
                ? '<div class="relative h-48 overflow-hidden bg-slate-100"><img loading="lazy" decoding="async" src="'+esc(x.cover.thumb_url)+'" alt="'+esc(x.proker?.nama||'Foto kegiatan')+'" class="w-full h-full object-cover transition duration-300 group-hover:scale-105">'+
                    '<div class="absolute top-3 left-3 max-w-[75%]"><span class="chip bl bg-white/95">'+esc(x.cover.uploader_organization?.nama||'Organisasi pengunggah tidak terdeteksi')+'</span></div>'+
                    '<span class="absolute top-3 right-3 chip bl bg-white/95">'+x.photo_count+' foto</span></div>'
                : '<div class="relative h-48 bg-slate-100 grid place-items-center text-slate-400">Foto kegiatan'+
                    '<div class="absolute top-3 left-3 max-w-[75%]"><span class="chip bl bg-white/95">'+esc(x.cover?.uploader_organization?.nama||'Organisasi pengunggah tidak terdeteksi')+'</span></div>'+
                    '<span class="absolute top-3 right-3 chip bl bg-white/95">'+x.photo_count+' foto</span></div>')+
              '<div class="p-4"><p class="font-semibold">'+esc(x.proker?.nama||'Kegiatan')+'</p>'+
                '<p class="text-xs text-slate-500 mt-1">'+dateID(x.proker?.tanggal_mulai||'')+(x.proker?.tanggal_selesai?' – '+dateID(x.proker.tanggal_selesai):'')+'</p>'+
                '<p class="text-xs text-slate-500 mt-1">Organisasi pengunggah: <b>'+esc(x.cover?.uploader_organization?.nama||'Tidak terdeteksi')+'</b></p>'+
                '<p class="text-xs text-slate-400 mt-1">Klik untuk melihat dokumentasi kegiatan</p></div>'+
            '</button>'
          ).join('')+
          '</div>'
        : emptyCard('Belum ada foto kegiatan.')
      );
};

V.laporan = function(){
    return pageHeader('Laporan akhir','Pantau laporan akhir kegiatan.')+
      (S.reports.length?'<div class="card overflow-x-auto"><table><thead><tr><th>Proker</th><th>Status</th><th>Tahap</th><th></th></tr></thead><tbody>'+S.reports.map(x=>'<tr><td><b>'+esc(x.proker?.nama||'-')+'</b></td><td>'+chip(x.status||'draft')+'</td><td>'+esc(x.tahap||'-')+'</td><td><button class="btn s" data-go="review:'+esc(x.proker_id||'')+'">Buka</button></td></tr>').join('')+'</tbody></table></div>':emptyCard('Belum ada laporan akhir.'));
};
