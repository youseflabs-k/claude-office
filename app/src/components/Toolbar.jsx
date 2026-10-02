import Icon from './Icon.jsx';
import { useStudio } from '../store/hooks.js';
import { store } from '../store/store.js';
export function IconButton({ icon, label, active = false, onClick, children, ...props }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={active || undefined} onClick={onClick} {...props}><Icon name={icon}/>{children}</button>;
}
export default function Toolbar() {
  const s = useStudio();
  // The studio on its own, in a second tab you can put on another screen.
  const openSolo = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('scene', '1');
    if (!window.open(url.href, '_blank', 'noopener')) {
      store.notify('Your browser blocked the new tab. Allow pop-ups for this page.', 'error');
    }
  };
  return <div className="scene-toolbar">
    <div className="segmented view-segment" aria-label="Camera view">
      <button className={s.view === 'studio' ? 'active' : ''} onClick={() => store.camera('view', 'studio')}><Icon name="cube" size={15}/>Studio</button>
      <button className={s.view === 'top' ? 'active' : ''} onClick={() => store.camera('view', 'top')}><Icon name="grid" size={15}/>Top view</button>
    </div>
    <IconButton icon="sun" label="View garden" active={s.view === 'garden'} onClick={() => store.camera('view', 'garden')}/>
    <IconButton icon="cube" label="View all project offices" active={s.view === 'neighbors'} onClick={() => store.camera('view', 'neighbors')}/>
    <div className="toolbar-separator"/>
    <IconButton icon="pointer" label="Select and orbit" active={s.tool === 'select'} onClick={() => store.setUI({ tool: 'select' })}/>
    <IconButton icon="move" label="Move selected agent (M)" active={s.tool === 'move'} onClick={() => { store.setUI({ tool: s.tool === 'move' ? 'select' : 'move' }); }}/>
    <div className="toolbar-spacer"/>
    <div className="zoom-controls"><IconButton icon="minus" label="Zoom out" onClick={() => store.camera('zoom', -0.15)}/><span>{s.zoom}%</span><IconButton icon="add" label="Zoom in" onClick={() => store.camera('zoom', 0.15)}/></div>
    <div className="toolbar-separator"/>
    <IconButton icon="eye" label="Show agent labels" active={s.settings.labels} onClick={() => store.setSetting('labels', !s.settings.labels)}/>
    <IconButton icon={s.settings.theme === 'sunset' ? 'sun' : 'moon'} label="Toggle evening lighting" onClick={() => store.setSetting('theme', s.settings.theme === 'sunset' ? 'night' : 'sunset')}/>
    <IconButton icon="target" label="Focus selected agent (F)" onClick={() => store.camera('focus')}/>
    <IconButton icon="full" label="Open the studio in its own tab" onClick={openSolo}/>
  </div>;
}
