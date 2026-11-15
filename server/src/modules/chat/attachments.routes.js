import { Router } from 'express';
import multer from 'multer';
import { pool } from '../../db/pool.js';
import { requireUser } from '../../middleware/require-user.js';
import {
  UploadError,
  safeFileName,
  processFile,
  listSessionAttachments,
  upload,
  limits,
  MAX_UPLOAD_MB,
  MAX_FILES_PER_REQUEST,
  MAX_FILES_PER_SESSION,
  MAX_FILES_PER_USER
} from './attachments.service.js';

export const attachmentsRouter = Router();

async function requireOwnSession(req, res, next) {
  if (!/^[0-9a-fA-F-]{36}$/.test(req.params.id)) return res.status(404).json({ error: 'Session not found' });
  try {
    const result = await pool.query('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Session not found' });
    next();
  } catch (error) { next(error); }
}

attachmentsRouter.get('/:id/attachments', requireUser, requireOwnSession, async (req, res, next) => {
  try {
    res.json({ attachments: await listSessionAttachments(req.user.id, req.params.id), limits: limits() });
  } catch (error) { next(error); }
});

// Ownership is verified before multer runs, so nothing is buffered for another user's session.
attachmentsRouter.post('/:id/attachments', requireUser, requireOwnSession, upload.array('files', MAX_FILES_PER_REQUEST), async (req, res, next) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Choose at least one file to attach.' });
  const userId = req.user.id;
  const sessionId = req.params.id;
  try {
    const counts = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE session_id = $2)::int AS in_session, COUNT(*)::int AS total
       FROM ai_documents WHERE user_id = $1 AND source_type = 'upload'`,
      [userId, sessionId]
    );
    const { in_session: inSession, total } = counts.rows[0];
    if (inSession + files.length > MAX_FILES_PER_SESSION) {
      return res.status(400).json({ error: `A chat can hold up to ${MAX_FILES_PER_SESSION} attachments. Remove one before adding more.` });
    }
    if (total + files.length > MAX_FILES_PER_USER) {
      return res.status(400).json({ error: `You have reached the limit of ${MAX_FILES_PER_USER} attached documents. Delete old chats or attachments first.` });
    }

    const results = [];
    for (const file of files) {
      try {
        results.push({ ok: true, ...(await processFile(userId, sessionId, file)) });
      } catch (error) {
        if (!(error instanceof UploadError)) console.error('[CampusOS attachments]', error?.message || 'Processing failed');
        results.push({
          ok: false,
          name: safeFileName(file.originalname),
          error: error instanceof UploadError ? error.message : 'This file could not be processed. Please try again.'
        });
      }
    }

    const attachments = await listSessionAttachments(userId, sessionId);
    if (!results.some(item => item.ok)) return res.status(422).json({ error: results[0].error, results, attachments });
    const warnings = [...new Set(results.flatMap(item => item.warnings || []))];
    res.status(201).json({ results, attachments, warnings, limits: limits() });
  } catch (error) { next(error); }
});

attachmentsRouter.delete('/:id/attachments/:docId', requireUser, requireOwnSession, async (req, res, next) => {
  if (!/^[\w-]{1,64}$/.test(req.params.docId)) return res.status(404).json({ error: 'Attachment not found' });
  try {
    const found = await pool.query(
      `SELECT id FROM ai_documents
       WHERE id::text = $1 AND user_id = $2 AND session_id = $3 AND source_type = 'upload'`,
      [req.params.docId, req.user.id, req.params.id]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Attachment not found' });
    const documentId = found.rows[0].id;
    await pool.query('DELETE FROM ai_chunks WHERE document_id = $1 AND user_id = $2', [documentId, req.user.id]);
    await pool.query('DELETE FROM ai_documents WHERE id = $1 AND user_id = $2', [documentId, req.user.id]);
    res.status(204).end();
  } catch (error) { next(error); }
});

attachmentsRouter.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Each file must be ${MAX_UPLOAD_MB} MB or smaller.` });
    return res.status(400).json({ error: `Attach up to ${MAX_FILES_PER_REQUEST} files at a time, using the “files” field.` });
  }
  next(error);
});
