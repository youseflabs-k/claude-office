import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { store } from '../store/store.js';
import {
  getAuthoring, getLibrary, createThing, applyProposal,
  saveItem, deleteItem, openEditor,
} from '../integrations/claude.js';

// Everything the panel used to do to a project's .claude directory: see what
// agents, skills, flows and rules it has, add more, and edit what is there.
//
// Flows and rules are proposed rather than written straight out — a flow is a
// slash command and a rule edits CLAUDE.md, and both deserve a look before
// they land. Agents and skills are new files, so they apply directly.

const KINDS = [
  { id: 'agent', label: 'Agent', icon: 'users', blurb: 'A specialist for this project.' },
  { id: 'skill', label: 'Skill', icon: 'spark', blurb: 'Know-how any agent can use.' },
  { id: 'flow', label: 'Flow', icon: 'arrow', blurb: 'A slash command.' },
  { id: 'rule', label: 'Rule', icon: 'edit', blurb: 'A line in CLAUDE.md.' },
];

function Create({ kind, projectId, onDone }) {
  const [form, setForm] = useState({ name: '', description: '', body: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await createThing({ kind, projectId, ...form });
      if (result.applied) {
        store.notify(`${kind} created.`, 'success');
        onDone();
      } else {
        setProposal(result.proposal);
      }
    } catch (err) {
      store.notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (proposal) {
    return <div className="claude-proposal">
      <div className="section-eyebrow">REVIEW BEFORE IT LANDS</div>
      <p className="modal-intro">{proposal.file}</p>
      <pre className="proposal-diff">{proposal.content}</pre>
      <div className="modal-footer">
        <button className="secondary-button" onClick={() => setProposal(null)}>Back</button>
        <button className="primary-button" onClick={async () => {
          try {
            await applyProposal(proposal);
            store.notify('Written.', 'success');
            onDone();
          } catch (err) { store.notify(err.message, 'error'); }
        }}>Write the file</button>
      </div>
    </div>;
  }

  return <form className="claude-form" onSubmit={submit}>
    {kind === 'rule'
      ? <label>Rule<textarea rows={4} value={form.text} onChange={set('text')} placeholder="Always run the tests before committing." required/></label>
      : <>
          <label>Name<input value={form.name} onChange={set('name')} placeholder="lowercase-with-dashes" required/></label>
          <label>Description<input value={form.description} onChange={set('description')} placeholder="When should this be used?" required/></label>
          <label>{kind === 'agent' ? 'System prompt' : 'Body'}
            <textarea rows={5} value={kind === 'agent' ? form.prompt ?? '' : form.body}
              onChange={set(kind === 'agent' ? 'prompt' : 'body')}/></label>
        </>}
    <div className="modal-footer">
      <button className="secondary-button" type="button" onClick={onDone}>Cancel</button>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Working…' : `Create ${kind}`}</button>
    </div>
  </form>;
}

function Library({ projectId }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState('');

  const load = async () => {
    try {
      const data = await getLibrary(projectId);
      setItems(data.items ?? []);
    } catch (err) { store.notify(err.message, 'error'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  if (open) {
    return <div className="claude-form">
      <div className="section-eyebrow">{open.path}</div>
      <textarea rows={16} value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false}/>
      <div className="modal-footer">
        <button className="secondary-button" onClick={() => setOpen(null)}>Back</button>
        <button className="danger-button" onClick={async () => {
          try {
            await deleteItem({ projectId, kind: open.kind, name: open.name });
            store.notify('Deleted.', 'success'); setOpen(null); load();
          } catch (err) { store.notify(err.message, 'error'); }
        }}>Delete</button>
        <button className="primary-button" onClick={async () => {
          try {
            await saveItem({ projectId, kind: open.kind, name: open.name, content: draft });
            store.notify('Saved.', 'success'); setOpen(null); load();
          } catch (err) { store.notify(err.message, 'error'); }
        }}>Save</button>
      </div>
    </div>;
  }

  if (!items) return <p className="modal-intro">Reading the project…</p>;
  if (!items.length) return <p className="modal-intro">Nothing in this project's .claude directory yet.</p>;

  return <ul className="claude-library">
    {items.map(item => (
      <li key={`${item.kind}:${item.name}`}>
        <button onClick={() => { setOpen(item); setDraft(item.content ?? ''); }}>
          <span className={`library-kind ${item.kind}`}>{item.kind}</span>
          <span className="library-name">{item.name}</span>
          <span className="library-desc">{item.description}</span>
        </button>
      </li>
    ))}
  </ul>;
}

export default function ProjectPanel({ projectId, onClose }) {
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = async () => {
    try { setSummary(await getAuthoring(projectId)); }
    catch (err) { store.notify(err.message, 'error'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  return <div className="tail-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="tail-panel project-panel">
      <header className="tail-bar">
        <h3>This project</h3>
        <span className="tail-sub">{projectId}</span>
        <button className="secondary-button" onClick={async () => {
          try { await openEditor(projectId); store.notify('Opening your editor.', 'success'); }
          catch (err) { store.notify(err.message, 'error'); }
        }}><Icon name="code" size={14}/>Open in editor</button>
        <button className="secondary-button" onClick={onClose}><Icon name="close" size={14}/>Close</button>
      </header>

      <nav className="claude-tabs">
        {['overview', 'library'].map(id => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setCreating(null); }}>
            {id === 'overview' ? 'Agents, skills & flows' : 'Browse & edit'}
          </button>
        ))}
      </nav>

      <div className="claude-body">
        {tab === 'library' && <Library projectId={projectId}/>}

        {tab === 'overview' && creating &&
          <Create kind={creating} projectId={projectId} onDone={() => { setCreating(null); load(); }}/>}

        {tab === 'overview' && !creating && <>
          <dl className="claude-summary">
            <div><dt>Agents</dt><dd>{summary?.agents?.join(', ') || 'none yet'}</dd></div>
            <div><dt>Skills</dt><dd>{summary?.skills?.join(', ') || 'none yet'}</dd></div>
            <div><dt>Flows</dt><dd>{summary?.flows?.map(f => `/${f}`).join(', ') || 'none yet'}</dd></div>
            <div><dt>Rules</dt><dd>{summary?.hasRules ? 'CLAUDE.md present' : 'no CLAUDE.md'}</dd></div>
          </dl>
          <div className="section-eyebrow">ADD SOMETHING</div>
          <div className="claude-kinds">
            {KINDS.map(k => (
              <button key={k.id} onClick={() => setCreating(k.id)}>
                <Icon name={k.icon} size={18}/>
                <strong>{k.label}</strong>
                <span>{k.blurb}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </div>
  </div>;
}
