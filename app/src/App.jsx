import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import AgentRoster from './components/AgentRoster.jsx';
import Inspector from './components/Inspector.jsx';
import Modal from './components/Modal.jsx';
import SceneView from './components/SceneView.jsx';
import Icon from './components/Icon.jsx';
import { useStudio } from './store/hooks.js';
import { store, startSimulation } from './store/store.js';
import { PROJECTS } from './simulation/engine.js';
import { installAgentBridge } from './integrations/agentBridge.js';
import { startClaudeStudio } from './integrations/claudeStudio.js';
import Transcript from './components/Transcript.jsx';
import { startCompletionAudio } from './audio/completion.js';
import ProjectPanel from './components/ProjectPanel.jsx';

export default function App() {
  const s = useStudio();
  const [showProject, setShowProject] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const showDetails = s.detailsOpen ?? false;
  const setShowDetails = value => store.setUI({ detailsOpen: value });
  const [showControls, setShowControls] = useState(true);
  const [showUI, setShowUI] = useState(true);

  const watching = s.world.agents.find(a => a.id === s.watching) ?? null;
  const project = PROJECTS.find(p => p.id === s.world.projectId) ?? { name: 'No workspace' };
  const working = s.world.agents.filter(a => a.phase === 'working').length;
  const counts = { office: 0, coffee: 0, lounge: 0 }; s.world.agents.forEach(a => counts[a.area]++);
  useEffect(() => {
    const stop = startSimulation(), disconnect = installAgentBridge(), stopAudio = startCompletionAudio(store);
    // Live Claude sessions drive who is in the studio.
    let leaveClaude = () => {};
    startClaudeStudio().then(fn => { leaveClaude = fn; });
    const keys = event => {
      if (event.target.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
      const { modal } = store.getSnapshot();
      if (modal) return;
      const key = event.key.toLowerCase();
      const actions = { '1': 'work', '2': 'coffee', '3': 'rest', '4': 'idle', '5': 'celebrate' };
      if (actions[key]) { event.preventDefault(); store.command(actions[key]); }
      if (key === ' ') { event.preventDefault(); store.pause(); }
      if (key === 'm') store.setUI({ tool: store.getSnapshot().tool === 'move' ? 'select' : 'move' });
      if (key === 'f') store.camera('focus');
      if (key === 'escape') store.setUI({ tool: 'select', sidebarOpen: false });
      if (key === '?') store.setUI({ modal: 'help' });
    };
    window.addEventListener('keydown', keys);
    return () => { stop(); disconnect(); stopAudio(); leaveClaude(); window.removeEventListener('keydown', keys); };
  }, []);
  return <div className={`world-home ${s.settings.theme === 'night' ? 'after-hours' : ''} ${showUI ? '' : 'ui-hidden'}`}>
    <main className="world-stage" aria-label="Office world"><SceneView key={s.settings.layout}/></main>
    <button className="world-ui-toggle glass-button" aria-label={showUI ? 'Hide all panels' : 'Show panels'} title={showUI ? 'Hide all panels' : 'Show panels'} onClick={() => setShowUI(!showUI)}><Icon name={showUI ? 'eye' : 'menu'}/></button>
    {showUI && <>
      <header className="world-header glass-panel">
        <button className="icon-button" aria-label="Toggle project navigation" aria-pressed={s.sidebarOpen} onClick={() => store.setUI({ sidebarOpen: !s.sidebarOpen })}><Icon name="menu"/></button>
        <span className="world-brand"><Icon name="cube" size={19}/>cozyoffice</span>
        <span className="world-header-divider"/>
        <select aria-label="Selected project" value={s.world.projectId ?? ''} onChange={e => store.project(e.target.value)}>
          {!PROJECTS.length && <option value="">Choose a project</option>}
          {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="world-live"><span className={`status-dot ${s.connection === 'live' ? '' : 'paused'}`}/>{s.connection === 'live' ? 'Live' : s.connection === 'down' ? 'Offline' : 'Connecting'}</span>
        <span className="world-population">{s.world.agents.length} here · {working} working</span>
      </header>
      <nav className="world-panel-toggles glass-panel" aria-label="World panels">
        <button className={showTeam ? 'active' : ''} aria-pressed={showTeam} onClick={() => setShowTeam(!showTeam)}><Icon name="users" size={16}/><span>Team</span></button>
        <button className={showDetails ? 'active' : ''} aria-pressed={showDetails} onClick={() => setShowDetails(!showDetails)}><Icon name="activity" size={16}/><span>Details</span></button>
        <button className={showControls ? 'active' : ''} aria-pressed={showControls} onClick={() => setShowControls(!showControls)}><Icon name="move" size={16}/><span>Controls</span></button>
        <button title="Project library" onClick={() => setShowProject(true)}><Icon name="folder" size={16}/><span>Library</span></button>
        <button title="Studio settings" aria-label="Studio settings" onClick={() => store.setUI({ modal: 'settings' })}><Icon name="settings" size={16}/></button>
      </nav>
      <Sidebar/>
      {showTeam && <section className="world-team glass-panel" aria-label="Team panel"><div className="world-panel-heading"><span>People in this office</span><button className="icon-button" aria-label="Close team panel" onClick={() => setShowTeam(false)}><Icon name="close" size={15}/></button></div><AgentRoster/></section>}
      {showDetails && <section className="world-details glass-panel" aria-label="Agent details panel"><div className="world-panel-heading"><span>Agent details</span><button className="icon-button" aria-label="Close details panel" onClick={() => setShowDetails(false)}><Icon name="close" size={15}/></button></div><Inspector onWatch={a => store.watch(a.id)}/></section>}
      {showControls && <div className="world-controls glass-panel"><Toolbar/></div>}
      <div className="world-help glass-panel"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><button className="icon-button" aria-label={s.paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => store.pause()}><Icon name={s.paused ? 'play' : 'pause'} size={14}/></button></div>
    </>}
    {!s.ready && !s.sceneError && <div className="world-loading glass-panel"><Icon name="cube" size={25}/><strong>Bringing your world to life</strong><span>{s.loadProgress}%</span></div>}
    {s.sceneError && <div className="world-loading glass-panel" role="alert"><strong>The world could not load</strong><p>{s.sceneError}</p><button className="primary-button" onClick={() => window.location.reload()}>Reload</button></div>}
    {s.settings.sounds && !s.audioReady && s.world.agents.some(a=>a.needsYou) && <button className="enable-alert-sounds glass-button" title="Play alerts when an agent needs you">Enable sounds</button>}
    {watching && <Transcript agent={watching} onClose={() => store.unwatch()}/>}
    {showProject && s.world.projectId && <ProjectPanel projectId={s.world.projectId} onClose={() => setShowProject(false)}/>}
    {s.toast && <div className={`toast ${s.toast.type}`} role="status" aria-live="polite"><span>{s.toast.message}</span><button aria-label="Dismiss message" onClick={() => store.setUI({ toast: null })}><Icon name="close" size={15}/></button></div>}
    <Modal/>
  </div>;
}
