import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Cutaway pavilion with real window/door openings, authored in wall-local coordinates. */
export function buildArchitecture(parent, layout) {
  const root = new THREE.Group(); root.name = 'pavilion-architecture'; parent.add(root);
  const [w,d] = layout.floor, height = 4.65;
  const plaster = new THREE.MeshStandardMaterial({ color:'#e6dfcd', roughness:.95 });
  const sage = new THREE.MeshStandardMaterial({ color:'#657765', roughness:.94 });
  const oak = new THREE.MeshStandardMaterial({ color:'#bd9a6e', roughness:.74 });
  const bronze = new THREE.MeshStandardMaterial({ color:'#705e46', roughness:.42, metalness:.4 });
  const glass = new THREE.MeshStandardMaterial({ color:'#b6cfcb', transparent:true, opacity:.14, roughness:.15, metalness:.15, side:THREE.DoubleSide, depthWrite:false });
  const box = (g,size,p,mat,r=.018) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(...size,1,Math.min(r,Math.min(...size)/3)),mat);
    m.position.set(...p); m.castShadow=m.receiveShadow=true; m.userData.ignorePick=true;g.add(m);return m;
  };
  const rectangle = (g,left,right,bottom,top,mat) => {
    if (right-left > .001 && top-bottom > .001) box(g,[right-left,top-bottom,.26],[(left+right)/2,(bottom+top)/2,0],mat,.012);
  };
  function wall(length, position, yaw, openings, mat) {
    const group = new THREE.Group();group.position.set(...position);group.rotation.y=yaw;root.add(group);
    let from = -length/2;
    for(const opening of [...openings].sort((a,b)=>a.x-b.x)) {
      const left=opening.x-opening.width/2,right=opening.x+opening.width/2;
      rectangle(group,from,left,0,height,mat);
      rectangle(group,left,right,0,opening.bottom,mat);
      rectangle(group,left,right,opening.bottom+opening.height,height,mat);
      from=right;
      if(opening.door) {
        // Oak portal; the handle is parented to the leaf and follows its hinge.
        for(const x of [left-.065,right+.065])box(group,[.13,opening.height+.08,.39],[x,opening.height/2,.04],oak);
        box(group,[opening.width+.26,.14,.39],[opening.x,opening.height+.07,.04],oak);
        box(group,[opening.width+.24,.06,.56],[opening.x,.015,.08],bronze);
        const hinge=new THREE.Group();hinge.position.set(left+.055,0,.08);hinge.rotation.y=-Math.PI*.23;group.add(hinge);
        const leafWidth=opening.width-.11;
        for(const x of [.045,leafWidth-.045])box(hinge,[.09,opening.height-.09,.095],[x,opening.height/2,.0],oak);
        for(const y of [.11,opening.height-.10])box(hinge,[leafWidth,.16,.095],[leafWidth/2,y,0],oak);
        const pane=box(hinge,[leafWidth-.18,opening.height-.42,.024],[leafWidth/2,opening.height/2,0],glass);pane.castShadow=false;
        box(hinge,[.035,.38,.045],[leafWidth-.20,1.45,.075],bronze);
        box(group,[2.2,.018,.9],[opening.x,.04,.85],new THREE.MeshStandardMaterial({color:'#aa9370',roughness:1}),.07);
      } else {
        for(const x of [left+.045,right-.045])box(group,[.09,opening.height,.22],[x,opening.bottom+opening.height/2,.03],oak);
        for(const y of [opening.bottom+.045,opening.bottom+opening.height-.045])box(group,[opening.width,.09,.22],[opening.x,y,.03],oak);
        box(group,[.04,opening.height-.18,.10],[opening.x,opening.bottom+opening.height/2,.12],bronze);
        const pane=box(group,[opening.width-.18,opening.height-.18,.018],[opening.x,opening.bottom+opening.height/2,.04],glass);pane.castShadow=false;
        box(group,[opening.width+.24,.10,.46],[opening.x,opening.bottom-.055,.11],oak);
        // Fine inner reveal avoids pasted-on frames and gives the opening depth.
        for(const x of [left-.045,right+.045])box(group,[.06,opening.height+.15,.30],[x,opening.bottom+opening.height/2,0],plaster);
      }
    }
    rectangle(group,from,length/2,0,height,mat);
    box(group,[length+.3,.25,.34],[0,height-.05,.01],oak);
    box(group,[length,.13,.13],[0,.12,.15],oak);
    return group;
  }
  wall(w,[0,0,-d/2],0,[
    {x:2.4,width:2.6,bottom:.82,height:3.12},
    {x:7.6,width:2.6,bottom:.82,height:3.12},
    {x:12.6,width:2.6,bottom:.82,height:3.12},
  ],sage);
  wall(d,[-w/2,0,0],Math.PI/2,[
    {x:6.6,width:2.6,bottom:.82,height:3.12},
    {x:.8,width:2.6,bottom:.82,height:3.12},
    {x:-7.2,width:2.35,bottom:0,height:3.45,door:true},
  ],plaster);
  // Front is cut away; corner posts and a short return establish a real building.
  for(const x of [-w/2,w/2])box(root,[.25,height,.25],[x,height/2,-d/2],plaster);
  box(root,[.26,1.1,2.7],[-w/2,.55,d/2-1.35],plaster);
  box(root,[.34,.10,2.75],[-w/2,1.12,d/2-1.35],oak);
  box(root,[w+.45,.22,d+.45],[0,-.16,0],new THREE.MeshStandardMaterial({color:'#c4beaa',roughness:.95}),.025);
  return root;
}
