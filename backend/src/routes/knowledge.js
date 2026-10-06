const express = require('express');
const { z } = require('zod');
const { query, queryOne } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ok, created, wrap, notFound } = require('../utils/response');
const vectorStore = require('../services/vectorStoreService');
const audit = require('../services/auditService');
const logger = require('../logger');

const router = express.Router();
router.use(authenticate);

const CATEGORIES = ['crop_disease', 'crop_management', 'irrigation', 'soil', 'fertilizer', 'pest_management', 'government', 'seasonal', 'general'];
const docSchema = z.object({
  title: z.string().trim().min(3).max(200),
  category: z.enum(CATEGORIES).default('general'),
  content: z.string().trim().min(20).max(200000),
  source: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable()).optional(),
});

// Agents can search the knowledge base (read-only); admins manage it.
router.get('/search', authorize('agent', 'admin'), wrap(async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return ok(res, { results: [] });
  ok(res, { results: await vectorStore.search(q, 5), embeddingModel: vectorStore.modelName() });
}));

router.get('/', authorize('admin'), wrap(async (req, res) => {
  const docs = await query(
    `SELECT d.id, d.title, d.category, d.source, d.created_at, d.updated_at, CHAR_LENGTH(d.content) AS length,
            (SELECT COUNT(*) FROM knowledge_chunks c WHERE c.document_id = d.id) AS chunks
       FROM knowledge_documents d ORDER BY d.updated_at DESC`);
  ok(res, { documents: docs, categories: CATEGORIES, embeddingModel: vectorStore.modelName() });
}));

router.get('/:id(\\d+)', authorize('admin'), wrap(async (req, res) => {
  const doc = await queryOne('SELECT * FROM knowledge_documents WHERE id = ?', [req.params.id]);
  if (!doc) throw notFound('Document not found');
  ok(res, { document: doc });
}));

router.post('/', authorize('admin'), validate(docSchema), wrap(async (req, res) => {
  const b = req.body;
  const r = await query('INSERT INTO knowledge_documents (title, category, content, source, created_by) VALUES (?,?,?,?,?)', [b.title, b.category, b.content, b.source ?? null, req.user.id]);
  let chunks = 0, indexError = null;
  try { chunks = await vectorStore.upsertDocument(r.insertId, b.title, b.content); } catch (err) { indexError = err.message; logger.error('Indexing failed', { docId: r.insertId, message: err.message }); }
  await audit.record(req.user.id, 'knowledge.create', 'knowledge_document', r.insertId, { title: b.title });
  created(res, { id: r.insertId, chunks, indexError }, indexError ? 'Saved, but indexing failed. Use Reindex later.' : 'Document added and indexed');
}));

router.put('/:id(\\d+)', authorize('admin'), validate(docSchema), wrap(async (req, res) => {
  const b = req.body, id = Number(req.params.id);
  const r = await query('UPDATE knowledge_documents SET title=?, category=?, content=?, source=? WHERE id=?', [b.title, b.category, b.content, b.source ?? null, id]);
  if (!r.affectedRows) throw notFound('Document not found');
  let chunks = 0, indexError = null;
  try { chunks = await vectorStore.upsertDocument(id, b.title, b.content); } catch (err) { indexError = err.message; }
  await audit.record(req.user.id, 'knowledge.update', 'knowledge_document', id, { title: b.title });
  ok(res, { chunks, indexError }, indexError ? 'Saved, but indexing failed' : 'Document updated and re-indexed');
}));

router.delete('/:id(\\d+)', authorize('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const doc = await queryOne('SELECT title FROM knowledge_documents WHERE id = ?', [id]);
  if (!doc) throw notFound('Document not found');
  await query('DELETE FROM knowledge_documents WHERE id = ?', [id]); // chunks cascade
  await audit.record(req.user.id, 'knowledge.delete', 'knowledge_document', id, { title: doc.title });
  ok(res, {}, 'Document deleted');
}));

router.post('/reindex', authorize('admin'), wrap(async (req, res) => {
  const n = await vectorStore.reindexAll({ force: true });
  await audit.record(req.user.id, 'knowledge.reindex', 'knowledge_document', null, { documents: n });
  ok(res, { documents: n }, `Reindexed ${n} document(s)`);
}));

module.exports = router;
