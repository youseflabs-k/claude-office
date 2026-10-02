import { memo, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { getTranscript, toolLabel, connect } from '../integrations/claude.js';

// What this agent is actually doing, read from its transcript.
//
// The live view keeps only a small recent tail; source transcripts stay intact.

const COLLAPSE_LINES = 12;
const COLLAPSE_CHARS = 800;

function Block({ text, className }) {
  const [open, setOpen] = useState(false);
  const lines = text.split('\n').length;
  const long = lines > COLLAPSE_LINES || text.length > COLLAPSE_CHARS;

  return <div className="tail-body">
    <pre className={`${className} ${long && !open ? 'clipped' : ''}`}>{text}</pre>
    {long && <button className="tail-toggle" onClick={() => setOpen(!open)}>
      {open ? 'hide' : lines > COLLAPSE_LINES
        ? `show ${lines} lines`
        : `show all ${text.length.toLocaleString()} characters`}
    </button>}
  </div>;
}

// Memoised rows keep streamed tail updates inexpensive.
const Line = memo(function Line({ entry }) {
  if (entry.kind === 'tool') {
    return <div className="tail-line tool">
      <span className="tail-tool">{toolLabel(entry.tool)}</span>
      {entry.detail && <Block text={entry.detail} className="tail-detail"/>}
    </div>;
  }
  return <div className={`tail-line ${entry.kind}`}>
    {entry.kind === 'user' && <span className="tail-who">you</span>}
    <Block text={entry.text} className="tail-text"/>
  </div>;
});

export default function Transcript({ agent, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const log = useRef(null);
  const signature = useRef('');

  useEffect(() => {
    let live = true, inFlight = false, pending = false, initial = true;
    const controller = new AbortController();
    signature.current = ''; setEntries(null); setError(null);
    const read = async () => {
      if (!live) return;
      if (inFlight) { pending = true; return; }
      inFlight = true;
      try {
        const data = await getTranscript(agent.sessionId, agent.id, { signal: controller.signal });
        if (!live) return;
        setError(null);
        const tail = data.entries.slice(-120);
        const last = tail.at(-1);
        const next = data.version ?? `${tail.length}:${last?.at}:${last?.text?.slice(-80)}`;
        if (next !== signature.current) {
          signature.current = next;
          const atBottom = initial || log.current && log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 80;
          setEntries(tail); initial = false;
          if (atBottom) requestAnimationFrame(() => { if (live && log.current) log.current.scrollTop = log.current.scrollHeight; });
        }
      } catch (err) { if (live && err.name !== 'AbortError') setError(err.message); }
      finally { inFlight = false; if (pending && live) { pending = false; read(); } }
    };
    read();
    const close = connect({ onChange: read, filter: event => event.sessionId === agent.sessionId || event.agentId === agent.id || agent.provider === 'codex' && event.kind === 'codex.changed' });
    const timer = setInterval(read, 1500);
    return () => { live = false; controller.abort(); close(); clearInterval(timer); };
  }, [agent.id, agent.sessionId, agent.provider]);

  return <div className="tail-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="tail-panel">
      <header className="tail-bar">
        <h3>{agent.name}</h3>
        <span className="tail-sub">{agent.provider === 'codex' ? 'Codex' : 'Claude'} · live tail · latest 120 entries</span>
        <button className="secondary-button" onClick={onClose}><Icon name="close" size={14}/>Close</button>
      </header>
      <div className="tail" ref={log}>
        {error && <p className="tail-note">{error}</p>}
        {!error && entries === null && <p className="tail-note">Reading…</p>}
        {!error && entries?.length === 0 && <p className="tail-note">Nothing written yet.</p>}
        {entries?.map((entry, i) => <Line key={`${entry.at}-${i}`} entry={entry}/>)}
      </div>
    </div>
  </div>;
}
