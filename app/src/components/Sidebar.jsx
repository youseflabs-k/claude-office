import { useState } from 'react';
import Icon from './Icon.jsx';
import { useStudio } from '../store/hooks.js';
import { store } from '../store/store.js';
import { importProject, folders as foldersApi } from '../integrations/claude.js';
import { loadWorkspaces } from '../integrations/claudeStudio.js';

// The last segment of a path that came from the server, whichever platform
// wrote it: Windows hands back C:\Users\you\project.
const lastSegment = (path) => path?.split(/[\\/]/).filter(Boolean).pop();

const ROOMS = [
  { id: 'office', icon: 'office', label: 'Office floor' },
  { id: 'lounge', icon: 'leaf', label: 'Rest area' },
  { id: 'coffee', icon: 'coffee', label: 'Coffee corner' },
];

export default function Sidebar() {
  const s = useStudio();
  const [busy, setBusy] = useState(null);

  const counts = { office: 0, coffee: 0, lounge: 0 };
  s.world.agents.forEach(a => counts[a.area]++);

  const { projects, folders, available } = s.workspaces;
  const byId = Object.fromEntries(projects.map(p => [p.id, p]));
  const filed = new Set(folders.flatMap(f => f.projectIds));
  const loose = projects.filter(p => !filed.has(p.id));

  const openProject = (project) => (
    <button
      key={project.id}
      className={`project-item ${project.id === s.world.projectId ? 'active' : ''}`}
      onClick={() => store.project(project.id)}
      title={project.realPath ?? project.claudeSlug}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', project.id)}
      aria-current={project.id === s.world.projectId ? 'page' : undefined}
    >
      <Icon name="chevron" size={12}/><Icon name="folder" size={17}/>
      <span>{project.displayName}</span>
      {project.id === s.world.projectId && <span className="tiny-count">{s.world.agents.length}</span>}
    </button>
  );

  // Dropping a project onto a folder files it there. The server owns the
  // index, so the list is re-read rather than patched locally.
  const fileInto = async (folderId, projectId) => {
    if (!projectId) return;
    await foldersApi({ action: 'assign', projectId, folderId });
    await loadWorkspaces();
  };

  const newFolder = async () => {
    const name = prompt('Folder name');
    if (!name?.trim()) return;
    await foldersApi({ action: 'create', name: name.trim() });
    await loadWorkspaces();
  };

  const bringIn = async (entry) => {
    setBusy(entry.dir);
    try {
      const { projectId } = await importProject(entry.dir);
      await loadWorkspaces();
      store.project(projectId);
    } catch (err) {
      store.notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return <>
    {s.sidebarOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => store.setUI({ sidebarOpen: false })}/>}
    <aside className={`sidebar ${s.sidebarOpen ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={e => { e.preventDefault(); store.camera('view', 'studio'); }}>
        <span className="brand-mark"><Icon name="cube" size={24}/></span>
        <span>cozy<span className="brand-light">office</span><small>CLAUDE & CODEX, AT WORK</small></span>
      </a>

      <div className="sidebar-heading">
        WORKSPACES <button className="heading-action" onClick={newFolder}>New folder</button>
      </div>

      {folders.map(folder => (
        <div
          key={folder.id}
          className="folder-group"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); fileInto(folder.id, e.dataTransfer.getData('text/plain')); }}
        >
          <div className="folder-label">
            <Icon name="folder" size={14}/><span>{folder.name}</span>
            <span className="tiny-count">{folder.projectIds.length}</span>
          </div>
          <nav className="project-list indented" aria-label={folder.name}>
            {folder.projectIds.map(id => byId[id]).filter(Boolean).map(openProject)}
          </nav>
        </div>
      ))}

      <nav className="project-list" aria-label="Projects">
        {loose.map(openProject)}
        {!projects.length && <p className="sidebar-empty">No projects imported yet.</p>}
      </nav>

      {available.length > 0 && <>
        <div className="sidebar-divider"/>
        <div className="sidebar-heading">AVAILABLE TO IMPORT <span>{String(available.length).padStart(2, '0')}</span></div>
        <nav className="project-list" aria-label="Available to import">
          {available.map(entry => (
            <button key={entry.dir} className="project-item dim" onClick={() => bringIn(entry)} title={entry.realPath ?? entry.claudeSlug}>
              <Icon name="add" size={13}/>
              <span>{busy === entry.dir ? 'importing…' : (lastSegment(entry.realPath) ?? entry.claudeSlug)}</span>
              <span className="tiny-count">{entry.provider === 'codex' ? 'Codex · ' : ''}{entry.sessionCount}</span>
            </button>
          ))}
        </nav>
      </>}

      <div className="sidebar-divider"/>
      <div className="sidebar-heading">YOUR SPACES</div>
      <nav className="spaces-list" aria-label="Office spaces">
        <button className={s.activeRoom === 'all' ? 'selected' : ''} onClick={() => { store.setUI({ activeRoom: 'all', sidebarOpen: false }); store.camera('view', 'studio'); }}>
          <Icon name="grid"/><span>The whole studio</span><span className="space-count">{s.world.agents.length}</span>
        </button>
        {ROOMS.map(room => (
          <button key={room.id} className={s.activeRoom === room.id ? 'selected' : ''} onClick={() => { store.setUI({ activeRoom: room.id, sidebarOpen: false }); store.camera('view', room.id); }}>
            <Icon name={room.icon}/><span>{room.label}</span><span className={`space-count ${room.id}`}>{counts[room.id]}</span>
          </button>
        ))}
      </nav>

      <div className="little-note">
        <span className="note-icon"><Icon name="spark" size={20}/></span>
        <strong>Good work has a rhythm.</strong>
        <p>A little focus. A coffee break.<br/>Something worth building.</p>
        <span className="note-line"/>
      </div>

      <div className="sidebar-bottom">
        <button className="sidebar-utility" onClick={() => store.setUI({ modal: 'settings' })}><Icon name="settings"/>Studio settings</button>
        <button className="sidebar-utility" onClick={() => store.setUI({ modal: 'help' })}><Icon name="help"/>A little guidance <kbd>?</kbd></button>
        <div className="local-indicator"><span className="status-dot"/> {s.world.agents.length} at work here.</div>
      </div>
    </aside>
  </>;
}
