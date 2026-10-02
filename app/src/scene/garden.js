import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A lawn garden with a shaded reading deck and a winding limestone walk. */
export function buildGarden(parent, layout, { lawn, paving, wood, prop, textures }) {
  const root=new THREE.Group(); root.name='project-garden'; parent.add(root);
  const [width,depth]=layout.floor, front=depth/2, gz=front+6;
  let seed=314159;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.95,...extra});
  const mesh=(geometry,mat,position,name)=>{
    const m=new THREE.Mesh(geometry,mat);m.position.set(...position);m.receiveShadow=true;m.userData.ignorePick=true;m.name=name??'';root.add(m);return m;
  };
  const turf=lawn.clone();turf.repeat.set(8,4);textures.push(turf);
  const grass=mesh(new THREE.PlaneGeometry(width+2,15),material('#dae6b6',{map:turf}),[0,-.037,front+7.5],'garden-lawn');grass.rotation.x=-Math.PI/2;grass.userData={floor:true};
  const pathMaterial=material('#ded6c0',{map:paving,bumpMap:paving,bumpScale:.012});
  const walks=[];
  function path(points,width=1.25) {
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z))), positions=[],uvs=[],indices=[];
    walks.push({points:curve.getPoints(32),width});
    for(let i=0;i<=48;i++) {
      const p=curve.getPoint(i/48),t=curve.getTangent(i/48);
      for(const side of [-1,1]) { const x=p.x-t.z*width*.5*side,z=p.z+t.x*width*.5*side;positions.push(x,-.012,z);uvs.push(x*.15,z*.15); }
      if(i<48){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    mesh(geometry,pathMaterial,[0,0,0],'garden-winding-path');
  }
  path([[0,front],[1.4,front+2.5],[.7,gz],[0,front+12.7]],1.45);
  path([[1.1,front+3],[-2.2,front+4.2],[-5.6,gz],[-8.5,gz]],1.1);
  path([[1.1,front+3],[3.7,front+3],[6.8,gz-1.2]],1.1);
  path([[.5,gz+2],[2.8,gz+2.7],[5.2,gz+1.6]],1.05);
  // Flush timber deck: feet and seating stay aligned with navigation at y=0.
  mesh(new RoundedBoxGeometry(6.8,.055,5,2,.025),material('#cfab7e',{map:wood}),[-8.5,-.035,gz],'garden-reading-deck');
  for(let i=0;i<23;i++) mesh(new THREE.BoxGeometry(.017,.003,4.8),material('#806b50'),[-11.7+i*.29,-.005,gz]);
  prop('studio/pergola',[-8.5,0,gz]);
  prop('studio/garden-bench',[-8.5,0,gz-1.4]);
  prop('studio/garden-bench',[-8.5,0,gz+1.4],Math.PI);
  prop('studio/outdoor-table',[-8.5,0,gz]);
  // A second, quieter reading seat looks out over the lawn and birdbath.
  const pad=mesh(new THREE.CircleGeometry(2.1,48),pathMaterial,[6.8,-.014,gz-2.2],'garden-reading-terrace');pad.rotation.x=-Math.PI/2;pad.scale.set(1,.7,1);
  prop('studio/garden-bench',[6.8,0,gz-2.2],0,1.15);
  prop('studio/garden-bench',[3.6,0,gz+1.6],Math.PI/2,1.15);
  prop('studio/birdbath',[7.2,0,gz+1]);
  // Informal ground-level borders replace the old rows of planter boxes.
  const beds=[[-13.4,front+8.5,1.7,4], [13.4,front+8.1,1.6,4.9], [0,front+13.6,5.8,.9], [-5.6,front+11.4,2,1.1]];
  const leaves=[],flowers=[];
  for(const [x,z,rx,rz] of beds) {
    const earth=mesh(new THREE.CircleGeometry(1,48),material('#566348'),[x,-.019,z],'garden-planted-border');earth.rotation.x=-Math.PI/2;earth.scale.set(rx,rz,1);
    for(let i=0;i<75;i++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random()),px=x+Math.cos(a)*rx*r,pz=z+Math.sin(a)*rz*r;
      leaves.push([px,.13+random()*.12,pz,.20+random()*.14]);
      if(i%2===0) flowers.push([px,.32+random()*.24,pz,.05+random()*.03]);
    }
  }
  for(let i=0;i<70;i++) {
    const a=i/70*Math.PI*2,r=1.4+random()*.30;
    const x=7.2+Math.cos(a)*r,z=gz+1+Math.sin(a)*r;
    leaves.push([x,.16,z,.23]);flowers.push([x,.40+random()*.14,z,.055]);
  }
  function planting(items,colors,name,flower=false) {
    const instances=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),material('#ffffff'),items.length),dummy=new THREE.Object3D();
    items.forEach(([x,y,z,r],i)=>{dummy.position.set(x,y,z);dummy.scale.set(r*(flower?1:1.5),r*(flower ? .65 : 1),r);dummy.rotation.y=random()*Math.PI;dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);instances.setColorAt(i,new THREE.Color(colors[i%colors.length]));});
    instances.name=name;instances.castShadow=instances.receiveShadow=true;instances.userData.ignorePick=true;root.add(instances);
  }
  planting(leaves,['#4e7145','#6d864f','#839562','#587953'],'garden-shrub-borders');
  planting(flowers,['#b4a3c5','#e8ddbe','#cda6a2','#d9ccea'],'garden-flowers',true);
  for(const [x,z,scale] of [[-14,front+3,1.15],[-12.6,front+12.7,1.05],[13.8,front+3.2,1.15],[12.9,front+12.8,1.20],[-3.1,front+14,1.05]]) {
    prop(x<0?'studio/olive-tree':'studio/birch-tree',[x,0,z],x*.23,scale);
    prop('studio/river-rocks',[x,0,z],x*.31,1.1);
  }
  for(const [x,z] of [[-11.2,gz-2],[-5.8,gz+2],[-12.2,front+10],[11.9,front+5]])prop('studio/fern-planter',[x,0,z],x*.2,1.1);
  // Tiny grass tufts add depth to the lawn without filling the walking paths.
  const tuftGeometry=new THREE.BufferGeometry();
  tuftGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.055,0,0,.055,0,0,.025,.18,0,0,0,-.055,0,0,.055,0,.15,.025],3));tuftGeometry.computeVertexNormals();
  const sites=[];
  for(let i=0;i<1600;i++) {
    const x=(random()-.5)*(width-2),z=front+.4+random()*14.2;
    if(Math.abs(x+8.5)<3.5&&Math.abs(z-gz)<2.6 || Math.hypot(x-6.8,(z-gz+2.2)/.7)<2.2)continue;
    if(beds.some(([bx,bz,rx,rz])=>((x-bx)/rx)**2+((z-bz)/rz)**2<1))continue;
    if(walks.some(({points,width})=>points.some(p=>Math.hypot(x-p.x,z-p.z)<width*.5+.2)))continue;
    sites.push([x,z]);
  }
  const tufts=new THREE.InstancedMesh(tuftGeometry,material('#6f8b51',{side:THREE.DoubleSide}),sites.length),dummy=new THREE.Object3D();
  sites.forEach(([x,z],i)=>{dummy.position.set(x,-.027,z);dummy.rotation.y=random()*Math.PI;dummy.scale.setScalar(.6+random()*.9);dummy.updateMatrix();tufts.setMatrixAt(i,dummy.matrix);});
  tufts.name='garden-grass-tufts';tufts.receiveShadow=true;tufts.userData.ignorePick=true;root.add(tufts);
  // Pergola lights stay within the reading nook, leaving the sky over the lawn open.
  const cable=[];
  for(let i=0;i<=16;i++) {
    const x=-11.3+i*.35,y=3.15-Math.sin(i/16*Math.PI)*.28;
    cable.push(new THREE.Vector3(x,y,gz+1.85));
    if(i%2===0)mesh(new THREE.SphereGeometry(.055,8,6),material('#ffdf9f',{emissive:'#ffc779',emissiveIntensity:1.3}),[x,y-.08,gz+1.85]);
  }
  const string=new THREE.Line(new THREE.BufferGeometry().setFromPoints(cable),new THREE.LineBasicMaterial({color:'#495548'}));root.add(string);
  return root;
}
