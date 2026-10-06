// VectorStoreService: the only module that knows how embeddings are stored/searched.
// Current implementation: embeddings as JSON in MySQL + cosine similarity in Node (fine for a few
// thousand chunks). To switch to Qdrant/Chroma/pgvector-style stores, re-implement the 4 exported
// functions (upsertDocument, deleteDocument, search, reindexAll) and keep the same signatures.
const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db');

const DIMS = 512;
const STOP = new Set('a an the and or of to in on at is are was were be been it this that for with as by from my your i you we our how what when why which do does should can will if not no yes have has had but so than then them they their there'.split(' '));

// ---- Embedders --------------------------------------------------------------------------
const tokenize = (text) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => !STOP.has(t) && t.length > 1);

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Deterministic hashing bag-of-words (+bigrams) embedder: no API needed, keyword-level semantics.
function localEmbed(text) {
  const vec = new Array(DIMS).fill(0);
  const tokens = tokenize(text);
  tokens.forEach((t, i) => {
    vec[fnv(t) % DIMS] += 1;
    if (i > 0) vec[fnv(`${tokens[i - 1]} ${t}`) % DIMS] += 0.5;
  });
  return normalizeVec(vec);
}

function normalizeVec(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / norm) * 1e5) / 1e5);
}

async function providerEmbed(texts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${config.ai.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({ model: config.ai.embeddingModel, input: texts }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Embedding API responded with HTTP ${res.status}`);
    const json = await res.json();
    return json.data.map((d) => d.embedding);
  } finally { clearTimeout(timer); }
}

const useProvider = () => config.ai.embeddingProvider === 'provider' && !!config.ai.apiKey;
const modelName = () => (useProvider() ? config.ai.embeddingModel : `local-hash-${DIMS}`);

async function embed(texts) {
  if (useProvider()) {
    try { return await providerEmbed(texts); } catch (err) {
      logger.warn('Embedding provider failed', { message: err.message });
      throw err;
    }
  }
  return texts.map(localEmbed);
}

// ---- Chunking -----------------------------------------------------------------------------
function chunkText(text, size = 700, overlap = 100) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const cut = clean.lastIndexOf('. ', end);
      if (cut > start + size / 2) end = cut + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ---- Store API ----------------------------------------------------------------------------
async function upsertDocument(docId, title, content) {
  const chunks = chunkText(`${title}. ${content}`);
  const vectors = await embed(chunks);
  await query('DELETE FROM knowledge_chunks WHERE document_id = ?', [docId]);
  for (let i = 0; i < chunks.length; i++) {
    await query('INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding, embedding_model) VALUES (?,?,?,?,?)', [
      docId, i, chunks[i], JSON.stringify(vectors[i]), modelName(),
    ]);
  }
  return chunks.length;
}

const deleteDocument = (docId) => query('DELETE FROM knowledge_chunks WHERE document_id = ?', [docId]);

const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function search(text, k = 4, minScore = 0.08) {
  const [qv] = await embed([text]);
  const rows = await query(
    `SELECT c.id, c.document_id, c.content, c.embedding, d.title, d.category, d.source
       FROM knowledge_chunks c JOIN knowledge_documents d ON d.id = c.document_id
      WHERE c.embedding_model = ?`,
    [modelName()]
  );
  return rows
    .map((r) => {
      const emb = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding;
      return { documentId: r.document_id, title: r.title, category: r.category, source: r.source, content: r.content, score: cosine(qv, emb) };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Index documents that have no chunks for the current embedding model (startup + after provider change).
async function reindexAll({ force = false } = {}) {
  const docs = await query(
    force
      ? 'SELECT id, title, content FROM knowledge_documents'
      : `SELECT d.id, d.title, d.content FROM knowledge_documents d
          WHERE NOT EXISTS (SELECT 1 FROM knowledge_chunks c WHERE c.document_id = d.id AND c.embedding_model = ?)`,
    force ? [] : [modelName()]
  );
  for (const d of docs) await upsertDocument(d.id, d.title, d.content);
  if (docs.length) logger.info('Knowledge base indexed', { documents: docs.length, embeddingModel: modelName() });
  return docs.length;
}

module.exports = { upsertDocument, deleteDocument, search, reindexAll, chunkText, modelName, _localEmbed: localEmbed, _cosine: cosine, _hash: (s) => crypto.createHash('sha1').update(s).digest('hex') };
