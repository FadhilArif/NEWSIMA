'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const cssSource = fs.readFileSync('style.css', 'utf8');
const adminCreateUser = fs.readFileSync('supabase/functions/admin-create-user/index.ts', 'utf8');
const coordinatorFunction = fs.readFileSync('supabase/functions/ukm-coordinator/index.ts', 'utf8');
const approvalHistoryMigration = fs.readFileSync('supabase/migrations/202610100008_approval_history_rls_timeout.sql', 'utf8');
const coordinatorAssignmentMigration = fs.readFileSync('supabase/migrations/202610100009_generalize_bem_coordinator_assignment.sql', 'utf8');
const safeUnitDeletionMigration = fs.readFileSync('supabase/migrations/202610100010_safe_delete_organization_unit.sql', 'utf8');

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
requireMatch(app, /data-unit-delete=/, 'Admin structure view must offer unit deletion');
requireMatch(app, /Ketik HAPUS untuk melanjutkan/, 'Unit deletion must require typed confirmation');
requireMatch(app, /organization_id:ukmId/, 'Coordinator assignment must support all child organization types');
requireMatch(coordinatorFunction, /\["HMJ", "UKM", "CLUB"\]\.includes\(child\.tipe\)/, 'Coordinator endpoint must accept HMJ, UKM, and UKM Minat Bakat');
requireMatch(coordinatorFunction, /body\.organization_id \|\| body\.ukm_id/, 'Coordinator endpoint must support the generalized organization ID and cached clients');
requireMatch(coordinatorFunction, /db\.rpc\("assign_bem_coordinator"/, 'Coordinator assignment must use the atomic server-side RPC');
requireMatch(approvalHistoryMigration, /CREATE POLICY persetujuan_select_optimized/, 'Approval history must use the optimized RLS policy');
requireMatch(approvalHistoryMigration, /private\.can_read_approval_history\(dokumen_id\)/, 'Approval history policy must not recurse through document RLS');
assert.ok(coordinatorAssignmentMigration.includes('GRANT EXECUTE ON FUNCTION public.assign_bem_coordinator(uuid, uuid, uuid) TO ' + 'service_' + 'role'), 'Coordinator RPC must be restricted to the server-side role');
requireMatch(safeUnitDeletionMigration, /IF NOT private\.is_admin\(\) THEN/, 'Unit deletion must be server-side and administrator-only');
requireMatch(safeUnitDeletionMigration, /UNIT_IN_USE/, 'Unit deletion must be blocked when relations still reference the unit');
requireMatch(safeUnitDeletionMigration, /v_unit\.jenis NOT IN \('kementerian', 'divisi'\)/, 'Only ministries and divisions can be deleted through the admin tool');
requireMatch(app, /sb\.rpc\('admin_delete_unit'/, 'Unit deletion must go through the server-side safe delete function');
requireMatch(cssSource, /workflow-steps\{\s*display:block!important;/, 'Mobile timeline must preserve a vertical heading layout');
requireMatch(html, /style\.css\?v=20261010-simawa-v2-phase4-01/, 'Style cache key must be bumped for mobile timeline fix');




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
requireMatch(cssSource, /SIMAWA V2 Phase 4: keep the timeline heading above/, 'Mobile timeline layout override must be present');

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
requireMatch(html, /app\.js\?v=20261010-simawa-v2-phase4-01/, 'UI bundle cache key must be refreshed');

console.log('SIMAWA-V2 workflow UI checks passed.');
