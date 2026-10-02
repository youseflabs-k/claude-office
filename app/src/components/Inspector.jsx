import { useState } from 'react';
import Icon from './Icon.jsx';
import { useStudio } from '../store/hooks.js';
import { store } from '../store/store.js';
import { Portrait, StatusPill, shortNumber } from './AgentRoster.jsx';
import { DESKS } from '../simulation/layout.js';

function TaskForm({ agent }) {
  const [draft, setDraft] = useState(agent.task);
  return <form className="task-form" onSubmit={e => { e.preventDefault(); store.updateAgent({ task: draft }); store.command('work'); store.notify('Task assigned. Heading to the desk.', 'success'); }}>
    <label className="section-eyebrow" htmlFor="task-input">NEXT UP <Icon name="edit" size={13}/></label>
    <textarea id="task-input" rows={2} maxLength={180} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Agent task"/>
    <button className="text-button task-submit" type="submit">Assign & start <Icon name="arrow" size={14}/></button>
  </form>;
}
function Conversation({ agent, others }) {
  const [partner, setPartner] = useState(others[0]?.id ?? ''), [text, setText] = useState('');
  const validPartner = others.some(a => a.id === partner) ? partner : others[0]?.id ?? '';
  return <section className="conversation-section">
    <div className="section-eyebrow">BETTER TOGETHER <Icon name="chat" size={14}/></div>
    <form onSubmit={e => { e.preventDefault(); if (validPartner) store.meet(validPartner, text.trim() || "Let's compare notes."); }}>
      <div className="meet-row"><select aria-label="Choose a coffee chat partner" value={validPartner} onChange={e => setPartner(e.target.value)} disabled={!others.length}>{!others.length && <option>No teammates yet</option>}{others.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><button className="secondary-button" type="submit" disabled={!validPartner} title="Meet at the coffee corner"><Icon name="coffee" size={16}/></button></div>
      <div className="say-row"><input aria-label="Speech bubble message" placeholder="A thought to share..." value={text} maxLength={120} onChange={e => setText(e.target.value)}/><button type="button" title="Show a speech bubble" aria-label="Show a speech bubble" disabled={!text.trim()} onClick={() => { store.say(text, agent.id); setText(''); }}><Icon name="arrow" size={16}/></button></div>
      <small>Arrange a coffee chat, or share a thought above the agent.</small>
    </form>
  </section>;
}
export default function Inspector({ onWatch }) {
  const s = useStudio(), a = s.world.agents.find(a => a.id === s.selectedId);
  if (!a) return <aside className="inspector empty-inspector"><Icon name="users" size={32}/><h3>A place for everyone.</h3><p>Select someone in the studio to see what they're up to.</p><button className="primary-button" onClick={() => store.setUI({ modal: 'hire' })}><Icon name="add"/>Add a teammate</button></aside>;
  const actions = [
    { id: 'work', icon: 'office', label: 'Work', active: a.phase === 'working', key: '1' },
    { id: 'coffee', icon: 'coffee', label: 'Coffee', active: a.phase === 'coffee', key: '2' },
    { id: 'rest', icon: 'leaf', label: 'Rest', active: a.phase === 'resting', key: '3' },
    { id: 'idle', icon: 'stand', label: 'Stand', active: a.phase === 'idle', key: '4' },
    { id: 'celebrate', icon: 'spark', label: 'Celebrate', active: a.phase === 'celebrating', key: '5' },
    { id: 'move', icon: 'move', label: 'Move', active: s.tool === 'move', key: 'M' }
  ];
  return <aside className="inspector" aria-label="Agent details">
    <div className="inspector-top"><span className="section-eyebrow">AGENT DETAILS</span><button className="icon-button small" title="Edit agent name and model label" aria-label="Edit agent identity" onClick={() => store.setUI({ modal: 'edit' })}><Icon name="edit" size={15}/></button></div>
    <div className="agent-hero" style={{ '--agent-color': a.color }}><span className="hero-orbit orbit-1"/><span className="hero-orbit orbit-2"/><span className="hero-spot"/><Portrait archetype={a.archetype}/><button className="hero-focus" title="Focus camera on this agent" aria-label="Focus camera on this agent" onClick={() => store.camera('focus')}><Icon name="target" size={17}/></button><span className="desk-caption">{DESKS[a.deskIndex].label}</span></div>
    <div className="agent-identity"><h2>{a.name}</h2><span className="provider-chip">{a.provider === 'codex' ? 'Codex' : a.external ? 'Claude' : 'Demo'}</span><div className="identity-sub"><span className="model-label"><Icon name="cube" size={12}/>{a.model}</span><StatusPill phase={a.phase} needsYou={a.needsYou}/></div></div>
    <div className="inspector-divider"/>
    <div className="section-eyebrow">GIVE THEM A DIRECTION</div>
    <div className="action-grid">{actions.map(action => <button data-testid={`command-${action.id}`} key={action.id} className={action.active ? 'active' : ''} title={`${action.label} (${action.key})`} onClick={() => {
      if (action.id === 'move') { store.setUI({ tool: 'move' }); store.notify('Click an open spot on the floor to move this agent.'); }
      else store.command(action.id);
    }}><Icon name={action.icon} size={19}/><span>{action.label}</span></button>)}</div>
    <div className="agent-metrics">
      <div className="metric-heading"><span><Icon name="bolt" size={13}/>Energy</span><strong>{Math.round(a.energy)}<small>%</small></strong></div><div className="thin-progress"><span style={{ width: `${a.energy}%`, background: a.energy < 30 ? '#ffd166' : a.color }}/></div>
      <div className="metrics-two"><div><span>Tokens</span><strong>{shortNumber(a.tokens)}<Icon name="chart" size={14}/></strong></div><div><span>Tasks done</span><strong>{a.tasksCompleted.toString().padStart(2, '0')}<Icon name="check" size={14}/></strong></div></div>
      <div className="progress-label"><span>Current task</span><strong>{Math.round(a.progress)}%</strong></div><div className="thin-progress task-progress"><span style={{ width: `${a.progress}%` }}/></div>
      <span className="simulation-note">{a.external ? 'Metrics supplied by your connected backend' : 'Local simulation · not API usage'}</span>
    </div>
    {a.sessionId && <button className="primary-button watch-button" onClick={() => onWatch?.(a)}><Icon name="target" size={14}/>Watch output</button>}
    {a.external && !a.sessionId && <button className="text-button local-mode-button" onClick={() => store.useLocalSimulation(a.id)}><Icon name="play" size={12}/>Use local simulation</button>}
    <TaskForm key={`task-${a.id}`} agent={a}/>
    <Conversation key={`chat-${a.id}`} agent={a} others={s.world.agents.filter(other => other.id !== a.id)}/>
    <button className="remove-link" onClick={() => store.setUI({ modal: 'remove' })}><Icon name="trash" size={13}/>Remove from this studio</button>
  </aside>;
}
