'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const adminCreateUser = fs.readFileSync('supabase/functions/admin-create-user/index.ts', 'utf8');

function requireMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

requireMatch(app, /const NEW_KAPRODI_STAGES=new Set\(\['kaprodi_hmj','kaprodi_hmj_lpj'\]\)/, 'Kaprodi review stages must be registered');
requireMatch(app, /const NEW_DEKAN_STAGES=new Set\(\['dekan_hmj','dekan_hmj_lpj'\]\)/, 'Dekan review stages must be registered');
requireMatch(app, /function isNewWorkflowDekan\(p\)\s*\{\s*return S\.user\.peran==='dekan'/, 'Dekan review must be based on the global Dekan role');
requireMatch(app, /data-go="review:'\+esc\(p\.id\)\+'"/, 'Proker list detail navigation must carry the selected proker ID');
requireMatch(app, /data-go="review:'\+esc\(x\.proker_id\|\|''\)\+'"/, 'Inbox and report detail navigation must carry the selected proker ID');
requireMatch(adminCreateUser, /\["user","admin","pembimbing","staf_keuangan","mahasiswa","wakil_rektor","kaprodi","dekan"\]\.includes\(peran\)/, 'Account creation must accept Kaprodi and Dekan roles');
requireMatch(adminCreateUser, /peran === "kaprodi" && \(!organisasiId \|\| jabatanKode !== "kaprodi" \|\| !unitId\)/, 'Kaprodi account creation must require HMJ, the Kaprodi position, and a program-study unit');
requireMatch(adminCreateUser, /callerProfile\?\.aktif !== true/, 'Account creation must only be available to active administrator profiles');



const loadProkerStart = app.indexOf('async function loadProker(');
const loadProkerEnd = app.indexOf('\nasync function loadNotifications', loadProkerStart);
assert.ok(loadProkerStart >= 0 && loadProkerEnd > loadProkerStart, 'loadProker block must exist');
const loadProker = app.slice(loadProkerStart, loadProkerEnd);
requireMatch(loadProker, /const isDekan\s*=\s*S\.user\.peran==='dekan';/, 'The Dekan queue query must be guarded by a declared role flag');
requireMatch(loadProker, /const dekanQuery=isDekan\s*\?/, 'The global Dekan query must use the declared Dekan role flag');
requireMatch(app, /function isNewWorkflowOwnerForwardStage\(p\).*String\(S\.orgId\|\|''\)===String\(p\.organisasi_id\|\|''\)/, 'Owner forwarding controls must require the owning organization context');
requireMatch(app, /return sb\.rpc\(useLegacy\?'transition_proker':'transition_proker_v2'/, 'New workflow actions must use the V2 RPC');
requireMatch(app, /action\('review_forward','Selesai review · teruskan ke Wakil Rektor 1'\)/, 'Dekan proposal review must forward directly to WR1');
requireMatch(app, /action\('review_forward','Selesai review LPJ · teruskan ke Wakil Rektor 1'\)/, 'Dekan LPJ review must forward directly to WR1');
requireMatch(app, /<th>Tahap<\/th>/, 'The Proker table must display the active workflow stage');
requireMatch(app, /return organizationType==='CLUB'\?label\.replace\(\/UKM\/g,'UKM Minat Bakat'\):label/, 'Club workflow labels must use UKM Minat Bakat');

const timelineStart = app.indexOf("const steps=processKind==='bem'");
const timelineEnd = app.indexOf('const isReturnedForRevision=', timelineStart);
assert.ok(timelineStart >= 0 && timelineEnd > timelineStart, 'Workflow timeline block must exist');
const timeline = app.slice(timelineStart, timelineEnd);
requireMatch(timeline, /'dekan_hmj'/, 'HMJ proposal timeline must include Dekan review');
requireMatch(timeline, /'wakil_rektor_hmj'/, 'HMJ proposal timeline must include WR1 after Dekan');
requireMatch(timeline, /'dekan_hmj_lpj'/, 'HMJ LPJ timeline must include Dekan review');
requireMatch(timeline, /'wakil_rektor_hmj_lpj'/, 'HMJ LPJ timeline must include WR1 after Dekan');
assert.doesNotMatch(timeline, /hmj_lanjut_wakil_rektor/, 'New HMJ timeline must not insert a second HMJ forwarding stage after Dekan');

const inboxStart = app.indexOf('async function loadInbox()');
const inboxBemStart = app.indexOf("}else if(activeOrg?.tipe==='BEM'){", inboxStart);
const inboxBemEnd = app.indexOf("}else if(S.user.peran==='wakil_rektor'){", inboxBemStart);
assert.ok(inboxStart >= 0 && inboxBemStart > inboxStart && inboxBemEnd > inboxBemStart, 'BEM inbox branch must exist');
const bemInbox = app.slice(inboxBemStart, inboxBemEnd);
requireMatch(bemInbox, /\.eq\('status','diajukan'\)/, 'BEM inbox must only show submitted documents awaiting action');
assert.doesNotMatch(bemInbox, /ownRes/, 'BEM inbox must not include BEM-owned submissions routed to WR1');

requireMatch(app, /Dekan Fakultas.*seluruh program studi/s, 'Dekan Proker view must explain the global faculty scope');
requireMatch(app, /Review informasi proposal dan LPJ HMJ dari seluruh program studi/, 'Dekan inbox must explain its review-only scope');
requireMatch(html, /app\.js\?v=20261010-simawa-v2-phase3-01/, 'UI bundle cache key must be refreshed');

console.log('SIMAWA-V2 workflow UI checks passed.');
