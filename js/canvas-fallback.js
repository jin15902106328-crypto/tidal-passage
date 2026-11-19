// Low-power path for browsers that expose Canvas 2D but have no WebGL context.
function createCanvasStage(canvas) {
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx) throw new Error('Canvas is unavailable');
  let width=1,height=1;
  const vp=new THREE.Matrix4(), model=new THREE.Matrix4();
  function screen(m,x,y,z=0){
    const e=m.elements,w=e[3]*x+e[7]*y+e[11]*z+e[15];
    if(w<.21)return null;
    return [(1+(e[0]*x+e[4]*y+e[8]*z+e[12])/w)*width*.5,
      (1-(e[1]*x+e[5]*y+e[9]*z+e[13])/w)*height*.5,w];
  }
  function paintTriangle(im,source,dest){
    if(dest.some(p=>!p))return;
    const [[u,v],[u1,v1],[u2,v2]]=source, [[x,y],[x1,y1],[x2,y2]]=dest;
    const a=u1-u,b=v1-v,c=u2-u,d=v2-v,det=a*d-b*c;
    const A=((x1-x)*d-(x2-x)*b)/det,C=((x2-x)*a-(x1-x)*c)/det;
    const B=((y1-y)*d-(y2-y)*b)/det,D=((y2-y)*a-(y1-y)*c)/det;
    const mx=(x+x1+x2)/3,my=(y+y1+y2)/3;
    ctx.save();ctx.beginPath();
    dest.forEach((p,i)=>{const k=1.25/Math.max(1,Math.hypot(p[0]-mx,p[1]-my));const dx=p[0]+(p[0]-mx)*k,dy=p[1]+(p[1]-my)*k;i?ctx.lineTo(dx,dy):ctx.moveTo(dx,dy)});
    ctx.closePath();ctx.clip();ctx.setTransform(A,B,C,D,x-A*u-C*v,y-B*u-D*v);
    const left=Math.max(0,Math.min(u,u1,u2)-3), top=Math.max(0,Math.min(v,v1,v2)-3);
    const w=Math.min(im.width,Math.max(u,u1,u2)+3)-left;
    const h=Math.min(im.height,Math.max(v,v1,v2)+3)-top;
    ctx.drawImage(im,left,top,w,h,left,top,w,h);ctx.restore();
  }
  function disc(object){
    model.multiplyMatrices(vp,object.matrixWorld);
    const u=object.material.uniforms,im=u.map.value.image,r=u.uRadius.value,t=u.uTime.value/20,hand=u.uHand.value;
    const n=4,grid=[];
    for(let j=0;j<=n;j++){
      grid[j]=[];
      for(let i=0;i<=n;i++){
        const x=(i/n*2-1)*r,y=(1-j/n*2)*r,rad=Math.hypot(x,y)/r;
        const a=hand*(t*(.30/(1+rad*2.8)-.055)+u.uDrift.value*.023/(.65+rad)),c=Math.cos(a),s=Math.sin(a);
        grid[j][i]=screen(model,c*x-s*y,s*x+c*y,.07*Math.sin(x*.48+y*.91+t)*Math.min(1,rad));
      }
    }
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const l=im.width*i/n,r=im.width*(i+1)/n,top=im.height*j/n,bot=im.height*(j+1)/n;
      const p=grid[j][i],q=grid[j][i+1],s=grid[j+1][i],t=grid[j+1][i+1];
      paintTriangle(im,[[l,top],[r,top],[l,bot]],[p,q,s]);
      paintTriangle(im,[[r,top],[r,bot],[l,bot]],[q,t,s]);
    }
  }
  function bridgePoint(s,off,deep,A,B,time){
    const p=time/20,it=1-s,span=Math.sin(Math.PI*s);
    const a=[A.x+1.42,A.y+.26,A.z-.1],b=[B.x-1,B.y-.29,B.z+.06];
    const l=[a[0]+1.07,a[1]+1.24+.32*p,a[2]-.78],r=[b[0]-1.34,b[1]-.85+.25*p,b[2]+1.04];
    const point=a.map((v,k)=>it**3*v+3*it*it*s*l[k]+3*it*s*s*r[k]+s**3*b[k]);
    const spread=off*(1+.16*Math.sin(s*13+p*.9));
    return [point[0]+.04*spread,point[1]+.15*span*Math.sin(7*s+p*1.4)+spread*.83,point[2]+.51*spread+deep];
  }
  function render(scene,camera){
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#080913';ctx.fillRect(0,0,width,height);
    const objects=scene.children.flatMap(o=>o.isGroup?o.children:[o]).sort((a,b)=>a.renderOrder-b.renderOrder);
    for(const o of objects){
      if(o.isMesh && o.material.uniforms.uRadius){disc(o);continue}
      if(o.isMesh && o.material.uniforms.uA){
        const u=o.material.uniforms,im=u.map.value.image,A=u.uA.value,B=u.uB.value,t=u.uTime.value;
        ctx.globalAlpha=.13+.45*Math.min(1,t/12);
        const point=(s,off)=>screen(vp,...bridgePoint(s,off,0,A,B,t));
        for(let i=0;i<18;i++){
          const l=i/18,r=(i+1)/18,p=point(l,1),q=point(r,1),a=point(l,-1),b=point(r,-1);
          const x=l*im.width,y=r*im.width,h=im.height;
          paintTriangle(im,[[x,0],[y,0],[x,h]],[p,q,a]);paintTriangle(im,[[y,0],[y,h],[x,h]],[q,b,a]);
        }
        ctx.globalAlpha=1;continue;
      }
      if(!o.isPoints) continue;
      const u=o.material.uniforms,pts=o.geometry.getAttribute('position'),col=o.geometry.getAttribute('tint'),props=o.geometry.getAttribute('star');
      const flow=o.renderOrder===6,step=o.renderOrder<0?3:(flow?13:17);
      model.multiplyMatrices(vp,o.matrixWorld);
      for(let i=0;i<pts.count;i+=step){
        const x=pts.getX(i),y=pts.getY(i),z=pts.getZ(i);
        const v=flow?screen(vp,...bridgePoint(x,y,z,u.uA.value,u.uB.value,u.uTime.value)):screen(model,x,y,z);
        if(!v || v[0]<0 || v[1]<0 || v[0]>width || v[1]>height)continue;
        const s=Math.max(.57,Math.min(3.2,props.getX(i)*height/1080*(flow ? .72 : .66)));
        ctx.fillStyle='rgba('+Math.round(col.getX(i)*255)+','+Math.round(col.getY(i)*255)+','+Math.round(col.getZ(i)*255)+','+Math.min(.91,props.getY(i)*.88)+')';
        if(s>1.35){
          ctx.beginPath();ctx.arc(v[0],v[1],s*.51,0,Math.PI*2);ctx.fill();
        } else ctx.fillRect(v[0],v[1],s,s);
      }
    }
  }
  return {capabilities:{getMaxAnisotropy:()=>1},setClearColor(){},
    setSize(w,h){width=canvas.width=w;height=canvas.height=h},render};
}

