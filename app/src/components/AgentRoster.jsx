import Icon from './Icon.jsx';
import { useStudio } from '../store/hooks.js';
import { store } from '../store/store.js';
import { PHASE_COLORS, PHASE_LABELS } from '../simulation/engine.js';
export function Portrait({ archetype, className = '' }) {
  return <img className={`portrait ${className}`} src={`${import.meta.env.BASE_URL}portraits/${archetype}.png`} alt="" draggable="false"/>;
}
export function StatusPill({ phase, needsYou=false }) { return <span className="status-pill" style={{ '--state-color': needsYou ? '#f5c26b' : PHASE_COLORS[phase] }}><span/>{needsYou ? 'Needs you' : PHASE_LABELS[phase]}</span>; }
export const shortNumber = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.floor(n));
export function ActivityFeed({ limit = 8 }) {
  const s = useStudio(), events = s.world.events.slice(0, limit);
  return <div className="activity-list">{events.length ? events.map(e => <button key={e.id} className="activity-row" onClick={() => e.agentId && store.select(e.agentId)} disabled={!e.agentId}>
    <span className={`event-icon ${e.kind}`}><Icon name={e.kind === 'success' ? 'check' : 'activity'} size={14}/></span>
    <span><strong>{e.title}</strong><small>{e.detail}</small></span><time>{s.world.time - e.time < 60 ? 'just now' : `${Math.floor((s.world.time - e.time) / 60)}m ago`}</time>
  </button>) : <div className="empty-message">A fresh start. Your team's activity will appear here.</div>}</div>;
}
export default function AgentRoster() {
  const s = useStudio();
  const agents = s.world.agents.filter(a => (s.activeRoom === 'all' || a.area === s.activeRoom) && a.name.toLowerCase().includes(s.search.toLowerCase()));
  return <section className="team-dock" aria-label="Your team">
    <div className="dock-heading">
      <div className="dock-tabs"><button className={s.panel === 'agents' ? 'active' : ''} onClick={() => store.setUI({ panel: 'agents' })}><Icon name="users" size={16}/>Your team <span>{s.world.agents.length}</span></button><button className={s.panel === 'activity' ? 'active' : ''} onClick={() => store.setUI({ panel: 'activity' })}><Icon name="activity" size={16}/>Activity<span className="small-live-dot"/></button></div>
      <label className="search-field"><Icon name="search" size={15}/><input aria-label="Find an agent" placeholder="Find an agent..." value={s.search} onChange={e => store.setUI({ search: e.target.value, panel: 'agents' })}/></label>
      <button className="text-button small" onClick={() => store.setUI({ modal: 'hire' })}><Icon name="add" size={15}/>Add teammate</button>
    </div>
    {s.panel === 'activity' ? <ActivityFeed limit={5}/> : <div className="agent-cards">{agents.map(a => <button className={`agent-card ${s.selectedId === a.id ? 'selected' : ''}`} key={a.id} onClick={() => store.select(a.id)} onDoubleClick={() => store.watch(a.id)} style={{ '--agent-color': a.color }} aria-pressed={s.selectedId === a.id}>
      <div className="card-portrait"><Portrait archetype={a.archetype}/></div><div className="card-copy"><strong>{a.name}</strong><span className="provider-chip">{a.provider === 'codex' ? 'Codex' : a.external ? 'Claude' : 'Demo'}</span><StatusPill phase={a.phase} needsYou={a.needsYou}/><small>{a.needsYou ? a.attentionText || 'Waiting for your answer.' : a.phase === 'working' ? a.task : a.area === 'coffee' ? 'A fresh perspective, brewing.' : a.area === 'lounge' ? 'Making room for the next idea.' : 'Ready for the next thing.'}</small></div>
      <span className="card-arrow"><Icon name="arrow" size={15}/></span>
    </button>)}{!agents.length && <div className="empty-message">No agents in this view. Choose another space or add a teammate.</div>}</div>}
  </section>;
}
