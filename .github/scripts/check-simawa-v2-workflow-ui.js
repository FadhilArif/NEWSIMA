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
const dekanDirectoryMigration = fs.readFileSync('supabase/migrations/202610100011_dekan_hmj_directory_and_coordinator_readonly.sql', 'utf8');
const secureDocumentAccessMigration = fs.readFileSync('supabase/migrations/202610100012_secure_document_file_access.sql', 'utf8');
const dekanFollowupMigration = fs.readFileSync('supabase/migrations/202610100013_dekan_proker_followup_visibility.sql', 'utf8');

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
requireMatch(app, /S\.user\.peran==='admin'&&\['kementerian','divisi'\]\.includes\(x\.jenis\)/, 'Unit deletion button must be limited to admins and only ministry/division units');
requireMatch(app, /Ketik HAPUS untuk melanjutkan/, 'Unit deletion must require typed confirmation');
requireMatch(app, /organization_id:ukmId/, 'Coordinator assignment must support all child organization types');
requireMatch(app, /sb\.rpc\('get_dekan_hmj_directory'\)/, 'Dekan HMJ directory must use its dedicated secure RPC');
requireMatch(app, /Cari nama HMJ/, 'Dekan must be able to search HMJ names');
requireMatch(app, /Cari nama anggota \/ NIM/, 'Dekan must be able to search members by name or NIM');
requireMatch(app, /coordinatorFollowupQuery/, 'Assigned coordinators must still see their HMJ proker after handoff');

requireMatch(app, /const dekanFollowupQuery=isDekan/, 'Dekan must query HMJ proker that remain visible after the active review stage');
requireMatch(app, /review_stage\.eq\.wakil_rektor_hmj_lpj.*lpj_disetujui/s, 'Dekan follow-up query must include HMJ prokers after handoff and in completed states');
requireMatch(app, /dekanFollowupRowsMarked/, 'Dekan follow-up rows must be marked read-only');
requireMatch(app, /if\(readOnlyDekanFollowup\)actions=/, 'Dekan follow-up details must not expose review or workflow actions');
requireMatch(app, /Pantauan Dekan · baca saja/, 'The proker list must label Dekan follow-up rows as read-only');
requireMatch(dekanFollowupMigration, /CREATE OR REPLACE FUNCTION private\.can_read_dekan_followup/, 'Dekan follow-up access must be scoped by a reviewed HMJ proker');
requireMatch(dekanFollowupMigration, /a\.sebagai = 'dekan'/, 'Dekan follow-up access must require a recorded Dekan decision');
requireMatch(dekanFollowupMigration, /proker_select_global_dekan_followup/, 'RLS must allow Dekan to read previously reviewed HMJ proker');
requireMatch(dekanFollowupMigration, /dokumen_select_global_dekan_followup/, 'RLS must allow authorized read-only document viewing after handoff');
requireMatch(dekanFollowupMigration, /persetujuan_select_global_dekan_followup/, 'RLS must allow the related approval history after handoff');

assert.ok(
  app.includes(".or('and(status.eq.proposal_diajukan,review_stage.in.(presiden_bem_hmj") &&
  app.includes("wakil_rektor_hmj)),and(status.eq.lpj_diajukan") &&
  app.includes("wakil_rektor_hmj_lpj)),and(review_stage.is.null"),
  'Coordinator follow-up filters must use three sibling OR clauses'
);
requireMatch(app, /__coordinatorReadOnly/, 'Coordinator follow-up rows must be read-only');
requireMatch(app, /galleryLoadedAt<45000/, 'Gallery data must be cached briefly to reduce repeat loading');
requireMatch(app, /getActivityThumbnailUrls\(coverPaths\)/, 'Gallery cover URL creation must run in parallel with metadata');
requireMatch(app, /loading="lazy" decoding="async"/, 'Gallery cover images must lazy-load');
requireMatch(dekanDirectoryMigration, /CREATE OR REPLACE FUNCTION public\.get_dekan_hmj_directory/, 'Dekan directory must use a dedicated RPC');
requireMatch(dekanDirectoryMigration, /private\.is_active_dekan\(\)/, 'Dekan directory RPC must enforce active Dekan role');
requireMatch(dekanDirectoryMigration, /proker_select_assigned_coordinator_followup/, 'Assigned coordinator read-only visibility must be enforced by RLS');
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

requireMatch(cssSource, /SIMAWA V2 Phase 6: enforce a non-collapsing workflow track/, 'Narrow workflow layout must use the high-specificity phase 6 override');
requireMatch(cssSource, /#app main \.workflow-steps \.workflow-steps-track/, 'Workflow track must keep fixed-width step cards inside its own scroll container');
requireMatch(html, /style\.css\?v=20261010-simawa-v2-phase6-01/, 'Style cache key must point to the new responsive layout');
requireMatch(html, /app\.js\?v=20261010-simawa-v2-phase8-01/, 'UI bundle cache key must point to the Dekan follow-up visibility fix');
requireMatch(app, /unit_kerja_id: profile\.unit_kerja_id \|\| null/, 'Kaprodi UI must load the profile program-study ID');
requireMatch(app, /const profileUnitId=String\(S\.user\.unit_kerja_id\|\|''\)/, 'Kaprodi stage authorization must not depend on an unloaded units cache');
requireMatch(app, /isNewWorkflowKaprodi\(p\)&&p\.status==='proposal_diajukan'&&p\.review_stage==='kaprodi_hmj'&&isProposalReview/, 'Kaprodi must have actions for a proposal assigned to its stage');
requireMatch(app, /action\('revise','Kembalikan ke HMJ untuk revisi','d'\)\+action\('approve','Setujui proposal'\)/, 'Kaprodi proposal review must provide revise and approve actions');
requireMatch(app, /isNewWorkflowKaprodi\(p\)&&p\.status==='lpj_diajukan'&&p\.review_stage==='kaprodi_hmj_lpj'&&isLpjReview/, 'Kaprodi must have actions for an LPJ assigned to its stage');
requireMatch(app, /action\('reject_lpj','Kembalikan LPJ untuk perbaikan','d'\)\+action\('approve_lpj','Setujui LPJ'\)/, 'Kaprodi LPJ review must provide revise and approve actions');
requireMatch(app, /const lpj=d\.docs\.find\(x=>\['laporan_akhir','lpj'\]\.includes\(x\.jenis\)\)/, 'LPJ review must recognize both supported document type names');




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
requireMatch(html, /app\.js\?v=20261010-simawa-v2-phase8-01/, 'UI bundle cache key must be refreshed');
requireMatch(app, /const canManageProkerDocuments=!readOnlyCollaborator/, 'Document upload controls must use owner-management permission, not review permission');
requireMatch(app, /\(canManageProkerDocuments&&p\.status==='selesai'/, 'LPJ upload must only be exposed to the owning organization when the Proker is finished');
requireMatch(app, /if\(!ownsProkerContext\)return toast\('Hanya pengelola organisasi pemilik Proker/, 'Upload handler must validate the owning organization before sending a file');
requireMatch(app, /if\(kind==='laporan_akhir'&&prokerSnapshot\.status!=='selesai'\)/, 'Upload handler must reject LPJ uploads while the LPJ is already under review');
requireMatch(app, /async function openSignedDocument\(path\)/, 'Document viewer must use a shared signed-URL opener');
requireMatch(app, /const viewer=window\.open\('about:blank','_blank'\)/, 'Document viewer must reserve a browser tab before requesting a signed URL');
requireMatch(app, /viewer\.location\.replace\(data\.signedUrl\)/, 'Document viewer must navigate the reserved tab to the signed URL');
requireMatch(secureDocumentAccessMigration, /CREATE OR REPLACE FUNCTION private\.can_read_document_path/, 'Signed URL authorization must check document access explicitly');
requireMatch(secureDocumentAccessMigration, /private\.can_read_approval_history\(d\.id\)/, 'Storage read authorization must reuse the same scoped access rules as approval history');
requireMatch(secureDocumentAccessMigration, /CREATE OR REPLACE FUNCTION private\.can_manage_proker_document/, 'Document writes must have a dedicated owner-and-stage permission guard');
requireMatch(secureDocumentAccessMigration, /DROP POLICY IF EXISTS documents_insert_member ON storage\.objects/, 'Storage upload policy must be tightened server-side');
requireMatch(secureDocumentAccessMigration, /DROP POLICY IF EXISTS dokumen_insert_authorized ON public\.dokumen/, 'Document metadata inserts must be tightened server-side');
requireMatch(secureDocumentAccessMigration, /DROP POLICY IF EXISTS dokumen_update_authorized ON public\.dokumen/, 'Document metadata updates must be tightened server-side');

console.log('SIMAWA-V2 workflow UI checks passed.');
