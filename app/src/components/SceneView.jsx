import { memo, useEffect, useRef } from 'react';
import { OfficeScene } from '../scene/OfficeScene.js';
import { store } from '../store/store.js';
function SceneView() {
  const host = useRef(null), labels = useRef(null);
  useEffect(() => {
    let scene;
    try { scene = new OfficeScene(host.current, labels.current); }
    catch (error) { console.error(error); store.setUI({ sceneError: 'WebGL could not start. Enable hardware acceleration in your browser, then reload.' }); }
    return () => scene?.dispose();
  }, []);
  return <div className="scene-mount"><div className="webgl-host" ref={host}/><div className="world-labels" ref={labels}/></div>;
}
export default memo(SceneView);
// Recreate the renderer and its native listeners after scene module updates.
if (import.meta.hot) import.meta.hot.accept('../scene/OfficeScene.js', () => import.meta.hot.invalidate());
