import { useState } from 'react';
import { post, errorMessage, AI_TIMEOUT } from '../api/client.js';
import { ErrorBox } from './ui.jsx';

const ACTIONS = [
  ['ask', '🤖 Ask AI (analyse)'], ['summarize', '📝 Summarize'], ['troubleshooting_questions', '❓ Troubleshooting questions'],
  ['generate_response', '✍️ Generate response'], ['improve_response', '✨ Improve my draft'],
];

// Suggestions only. Nothing here sends a message: the agent copies text into the reply box and sends it.
export default function AgentAiAssist({ ticketId, conversationId, draft, onUse }) {
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async (action) => {
    setBusy(action); setError(''); setResult(null);
    try {
      const body = { action, ...(ticketId ? { ticketId } : {}), ...(conversationId ? { conversationId } : {}), ...(action === 'improve_response' ? { draft } : {}) };
      setResult({ action, ...(await post('/ai/assist', body, { timeout: AI_TIMEOUT })) });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <div className="card space-y-3">
      <div className="font-bold text-leaf-900">AI Assist <span className="text-xs font-normal text-gray-500">(suggestions only, you decide what to send)</span></div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(([a, label]) => (
          <button key={a} className="btn-secondary btn-sm" disabled={!!busy || (a === 'improve_response' && !(draft || '').trim())} onClick={() => run(a)} title={a === 'improve_response' ? 'Type a draft reply first' : ''}>
            {busy === a ? 'Thinking…' : label}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {result && (
        <div className="space-y-2 rounded-lg bg-leaf-50 p-3 text-sm">
          <div className="whitespace-pre-wrap">{result.text}</div>
          {result.sources && result.sources.length > 0 && <div className="text-xs text-gray-500">Knowledge used: {result.sources.map((s) => s.title).join(' · ')}</div>}
          <div className="flex flex-wrap gap-2">
            {onUse && ['generate_response', 'improve_response'].includes(result.action) && <button className="btn-primary btn-sm" onClick={() => onUse(result.text)}>Put in reply box</button>}
            <button className="btn-secondary btn-sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(result.text)}>Copy</button>
          </div>
          <div className="text-xs text-gray-500">AI-generated. Review for accuracy before using.</div>
        </div>
      )}
    </div>
  );
}
