import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useStudio } from '../store/hooks.js';
import { store } from '../store/store.js';
import { LAYOUTS, LAYOUT_IDS } from '../simulation/layouts.js';
import { CHARACTERS } from '../simulation/catalog.js';
import { Portrait } from './AgentRoster.jsx';

function Toggle({ label, description, checked, onChange }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" className="toggle-input" checked={checked} onChange={e => onChange(e.target.checked)}/><span className="toggle-track" aria-hidden="true"/></label>;
}
export function exportWorkspace() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `${store.getSnapshot().world.projectId}-workspace.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); store.notify('Workspace exported.', 'success');
}
function HireContent() {
  const s = useStudio(), [selected, setSelected] = useState(CHARACTERS.find(c => !s.world.agents.some(a => a.archetype === c.id))?.id ?? CHARACTERS[0].id);
  return <><div className="modal-kicker">ROOM FOR A NEW PERSPECTIVE</div><h2>Meet your next teammate.</h2><p className="modal-intro">Sixteen characters. A desk of their own. Choose someone to join this studio.</p>
    <div className="character-picker">{CHARACTERS.map(c => <button key={c.id} className={selected === c.id ? 'selected' : ''} style={{ '--agent-color': `#${c.color}` }} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}><Portrait archetype={c.id}/><span>{c.id}</span>{selected === c.id && <i><Icon name="check" size={14}/></i>}</button>)}</div>
    <div className="modal-footer"><span className="muted mono">{s.world.agents.length} of 12 desks assigned</span><button className="primary-button" disabled={s.world.agents.length >= 12} onClick={() => store.hire(selected)}><Icon name="add"/>Welcome aboard</button></div>
  </>;
}
function SettingsContent() {
  const s = useStudio(), input = useRef(null);
  return <><div className="modal-kicker">MAKE YOURSELF AT HOME</div><h2>Your studio, your rhythm.</h2><p className="modal-intro">These preferences and each project's team are saved in this browser.</p>
    <div className="settings-group"><div className="section-eyebrow">THE ATMOSPHERE</div>
      <div className="lighting-options">{[{ id: 'sunset', icon: 'sun', title: 'Golden hour', sub: 'A little warmth for your work.' }, { id: 'night', icon: 'moon', title: 'After hours', sub: 'Quiet focus. The lights stay on.' }].map(t => <button key={t.id} className={s.settings.theme === t.id ? 'active' : ''} aria-pressed={s.settings.theme === t.id} onClick={() => store.setSetting('theme', t.id)}><Icon name={t.icon} size={24}/><strong>{t.title}</strong><small>{t.sub}</small></button>)}</div>
      <label className="setting-row"><span><strong>Graphics quality</strong><small>Lower settings reduce shadows and rendering resolution.</small></span><select value={s.settings.quality} onChange={e => store.setSetting('quality', e.target.value)}><option value="low">Lightweight</option><option value="balanced">Balanced</option><option value="high">High quality</option></select></label>
      <Toggle label="Notification sounds" description="Chimes when an agent needs you or finishes a task." checked={s.settings.sounds} onChange={v => store.setSetting('sounds', v)}/>
      <Toggle label="Floating nameplates" description="Keep names and status visible in the studio." checked={s.settings.labels} onChange={v => store.setSetting('labels', v)}/>
    </div>
    <div className="settings-group"><div className="section-eyebrow">THE ARRANGEMENT</div>
      <div className="layout-options">{LAYOUT_IDS.map(id => <button key={id} className={s.settings.layout === id ? 'active' : ''} aria-pressed={s.settings.layout === id} onClick={() => store.setSetting('layout', id)}><strong>{LAYOUTS[id].name}</strong><small>{LAYOUTS[id].blurb}</small></button>)}</div>
    </div>
    <div className="settings-group"><div className="section-eyebrow">A LIVING LITTLE OFFICE</div><Toggle label="Autonomous routines" description="Agents take breaks and return to their desks on their own." checked={s.settings.autonomous} onChange={v => store.setSetting('autonomous', v)}/>
      <label className="setting-row"><span><strong>Simulation speed</strong><small>Affects movement, animation and local task progress.</small></span><select value={s.settings.speed} onChange={e => store.setSetting('speed', Number(e.target.value))}><option value={0.5}>0.5× · unhurried</option><option value={1}>1× · just right</option><option value={2}>2× · a little faster</option></select></label>
    </div>
    <div className="settings-group"><div className="section-eyebrow">YOUR WORKSPACE DATA</div><div className="data-actions"><button className="secondary-button" onClick={exportWorkspace}><Icon name="download"/>Export JSON</button><button className="secondary-button" onClick={() => input.current.click()}><Icon name="upload"/>Import JSON</button><button className="text-button danger" onClick={() => store.setUI({ modal: 'reset' })}><Icon name="reset" size={15}/>Reset studio</button></div>
      <input type="file" accept="application/json,.json" ref={input} hidden onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 1_000_000) store.notify('Please choose a JSON file smaller than 1 MB.', 'error');
        else try { store.importJSON(await file.text()); } catch { store.notify('That file could not be read.', 'error'); }
        e.target.value = '';
      }}/>
      <div className="privacy-note"><Icon name="lock" size={18}/><span>No accounts. No telemetry. No API keys.<br/>This is a local simulation until you connect your own backend. See <code>docs/INTEGRATION.md</code>.</span></div>
    </div>
  </>;
}
function EditContent() {
  const a = useStudio(s => s.world.agents.find(a => a.id === s.selectedId));
  const [name, setName] = useState(a?.name ?? ''), [model, setModel] = useState(a?.model ?? '');
  return <form onSubmit={e => { e.preventDefault(); store.updateAgent({ name, model }); store.setUI({ modal: null }); store.notify('A fresh introduction.', 'success'); }}><div className="modal-kicker">A NAME OF THEIR OWN</div><h2>A small introduction.</h2><p className="modal-intro">Labels are live interface text, not part of the character artwork.</p><label className="form-field">Agent name<input autoFocus required maxLength={48} value={name} onChange={e => setName(e.target.value)}/></label><label className="form-field">Model label<input maxLength={48} value={model} onChange={e => setModel(e.target.value)}/><small>A display label only. Changing it does not connect an AI provider.</small></label><div className="modal-footer"><button type="button" className="secondary-button" onClick={() => store.setUI({ modal: null })}>Cancel</button><button className="primary-button" disabled={!name.trim()}><Icon name="check"/>Save changes</button></div></form>;
}
function HelpContent() {
  return <><div className="modal-kicker">A LITTLE GUIDANCE</div><h2>Settle into the studio.</h2><p className="modal-intro">A real 3D space, with a few simple ways to get around.</p><div className="help-grid">
    <section><Icon name="pointer" size={24}/><h3>Meet the team</h3><p>Click a character, their nameplate or their card. The detail panel gives you task, movement and conversation controls.</p></section>
    <section><Icon name="move" size={24}/><h3>Find your perspective</h3><p>Drag to orbit. Scroll or pinch to zoom. Right-drag to pan. Use the view buttons to jump to a room.</p></section>
    <section><Icon name="coffee" size={24}/><h3>Give them a direction</h3><p>Click the couch or coffee counter to send the selected agent there. Click an unassigned desk to reassign their workstation.</p></section>
    <section><Icon name="chat" size={24}/><h3>Make room for ideas</h3><p>Choose a teammate in the detail panel to arrange a coffee chat. Speech bubbles are your text, not generated AI replies.</p></section>
    </div><div className="shortcuts">{[['1', 'Go to work'], ['2', 'Coffee break'], ['3', 'Rest in lounge'], ['4', 'Stand idle'], ['5', 'Celebrate'], ['M', 'Move tool'], ['F', 'Focus agent'], ['Space', 'Pause / resume'], ['Esc', 'Close / select']].map(([key, label]) => <div key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div><p className="help-tip"><strong>Quick move:</strong> Shift-click any open floor space to move the selected agent without changing tools.</p></>;
}
export default function Modal() {
  const s = useStudio(), ref = useRef(null);
  useEffect(() => { if (s.modal && ref.current && !ref.current.open) ref.current.showModal(); }, [s.modal]);
  if (!s.modal) return null;
  const a = s.world.agents.find(a => a.id === s.selectedId);
  return <dialog ref={ref} className={`modal ${s.modal === 'hire' ? 'wide' : ''}`} onCancel={() => store.setUI({ modal: null })} onClick={e => { if (e.target === ref.current) store.setUI({ modal: null }); }} aria-label={s.modal === 'hire' ? 'Hire an agent' : s.modal === 'settings' ? 'Studio settings' : 'Studio dialog'}>
    <div className="modal-inner"><button className="modal-close icon-button" aria-label="Close dialog" onClick={() => store.setUI({ modal: null })}><Icon name="close"/></button>
      {s.modal === 'hire' && <HireContent/>}{s.modal === 'settings' && <SettingsContent/>}{s.modal === 'edit' && <EditContent key={a?.id}/>} {s.modal === 'help' && <HelpContent/>}
      {s.modal === 'reset' && <><div className="modal-kicker">A FRESH START</div><h2>Reset this studio?</h2><p className="modal-intro">This replaces the current project's agents, tasks and positions with the original team. Your other projects and settings stay as they are.</p><div className="modal-footer"><button className="secondary-button" onClick={() => store.setUI({ modal: null })}>Keep my studio</button><button className="primary-button" onClick={() => store.reset()}>Reset this project</button></div></>}
      {s.modal === 'remove' && <><div className="modal-kicker">ROOM FOR SOMETHING NEW</div><h2>Remove {a?.name}?</h2><p className="modal-intro">Their desk will be available. Their current task and local metrics will be removed from this project.</p><div className="modal-footer"><button className="secondary-button" onClick={() => store.setUI({ modal: null })}>Keep teammate</button><button className="danger-button" onClick={() => a && store.remove(a.id)}>Remove agent</button></div></>}
    </div>
  </dialog>;
}
