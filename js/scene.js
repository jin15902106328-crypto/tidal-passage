/* Deterministic scene. All cameras and tidal deformation sample the same 20 s clock. */
async function createTidalScene(canvas, assets, options = {}) {
  const T = THREE;
  const renderer = options.renderer || new T.WebGLRenderer({
    canvas, context: options.context, alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: !!options.capture
  });
  renderer.setClearColor(0x060711);
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
  renderer.sortObjects = true;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(43, 16 / 9, 0.10, 210);
  const vector = (x, y, z) => new T.Vector3(x, y, z);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function smooth(a, b, x) {
    const t = clamp((x-a)/(b-a), 0, 1);
    return t*t*(3-2*t);
  }
  const seconds = { value: 0 }, drift = { value: 0 }, height = { value: 900 };
  const aCenter = {value: vector(0,0,0)}, bCenter = {value: vector(0,0,0)};
  const uniforms = {uTime: seconds, uDrift: drift, uHeight: height, uA: aCenter, uB: bCenter};
  const loader = new T.TextureLoader();
  const [amber, azure, thread, sky] = await Promise.all(
    [assets.warm, assets.cold, assets.bridge, assets.sky].map(options.loadTexture || (url => loader.loadAsync(url)))
  );
  for (const tex of [amber, azure, thread]) tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  function seeded(state) {
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let x = Math.imul(state ^ state >>> 15, state | 1);
      x ^= x + Math.imul(x ^ x >>> 7, x | 61);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    return Math.sqrt(-2*Math.log(Math.max(1e-8,rand()))) * Math.cos(2*Math.PI*rand());
  }
  const soft = {transparent: true, depthTest:false, depthWrite:false, side:T.DoubleSide};
  const additive = {...soft, blending:T.AdditiveBlending};
  const backdrop = new T.Mesh(new T.SphereGeometry(130,42,28), new T.ShaderMaterial({
    uniforms:{map:{value:sky}}, side:T.BackSide, depthWrite:false, depthTest:false,
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=vec4(texture2D(map,vUv).rgb,1.0);}`
  }));
  backdrop.renderOrder=-12;
  scene.add(backdrop);
  const warp = `
    uniform float uTime, uRadius, uHand, uDrift;
    vec3 discWarp(vec3 p) {
      float r = length(p.xy) / uRadius;
      float phase = uTime / 20.0;
      float angle = uHand * phase * (0.30 / (1.0 + r * 2.8) - 0.055);
      angle += uHand*uDrift*.023/(.65+r);
      float c=cos(angle),s=sin(angle);
      vec2 q=mat2(c,s,-s,c)*p.xy;
      float rim=smoothstep(.25,.97,r);
      float nearArm = smoothstep(-.42,.93, uHand*q.x/(.01+length(q)));
      q.x += uHand*.34*rim*nearArm*phase;
      q.y += .13*rim*sin(q.x*1.31+q.y*.52+phase*.7);
      return vec3(q,p.z + rim*(.12*sin(q.y*.91+q.x*.48+phase) + .22*nearArm*phase));
    }
  `;
  const starFragment = `
    varying vec3 vColor; varying float vAlpha; varying float vFlare;
    void main() {
      vec2 d=2.0*gl_PointCoord-1.0;
      float r2=dot(d,d);
      if(r2>1.) discard;
      float m=exp(-6.5*r2)+.17*exp(-2.3*r2);
      float rays=(exp(-21.*abs(d.x)-3.5*abs(d.y)) + exp(-21.*abs(d.y)-3.5*abs(d.x)))*.29*vFlare;
      gl_FragColor=vec4(vColor, clamp((m+rays)*(1.-smoothstep(.73,1.,r2))*vAlpha,0.,1.));
    }
  `;
  function makePoints(pos, colors, props, vertexShader, materialUniforms, order) {
    const geom=new T.BufferGeometry();
    geom.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geom.setAttribute('tint',new T.Float32BufferAttribute(colors,3));
    geom.setAttribute('star',new T.Float32BufferAttribute(props,3));
    const points=new T.Points(geom,new T.ShaderMaterial({
      ...additive, uniforms:materialUniforms, vertexShader, fragmentShader:starFragment
    }));
    points.frustumCulled=false;
    points.renderOrder=order;
    return points;
  }
  const starPrelude = `
    attribute vec3 tint, star;
    varying vec3 vColor; varying float vAlpha, vFlare;
    uniform float uHeight;
    void projectStar(vec4 mv, float factor, float intensity) {
      float z=-mv.z;
      gl_Position=projectionMatrix*mv;
      float size=star.x*factor*(uHeight/900.0);
      float pix=clamp(size,1.25,23.0);
      gl_PointSize=pix;
      vColor=tint;
      vAlpha=star.y * min(1.,size*size/(pix*pix)) * intensity * smoothstep(.25,.9,z);
      vFlare=star.z;
    }
  `;
  const farRand=seeded(4918), skyPos=[], skyColors=[], skyProps=[];
  for (let i=0;i<18500;i++) {
    const y=farRand()*2-1, a=farRand()*Math.PI*2, planar=Math.sqrt(1-y*y), r=29+farRand()*75;
    skyPos.push(r*Math.cos(a)*planar, r*y, r*Math.sin(a)*planar);
    const temp=farRand(), lum=farRand();
    skyColors.push(0.75+.24*temp,.78+.14*farRand(),1-.24*temp);
    skyProps.push(0.85+2.15*Math.pow(lum,3)+(lum>.986?1.65:0),.19+.62*Math.pow(lum,2),lum>.977?1:0);
  }
  scene.add(makePoints(skyPos,skyColors,skyProps,starPrelude+`
    void main(){projectStar(modelViewMatrix*vec4(position,1.),1.,1.);}
  `,uniforms,-10));

  // Luminosity-weighted sampling keeps the volumetric star layer registered to the gas lanes.
  function positionsFromTexture(texture) {
    const n=192;
    const binary=atob(texture===amber?assets.warmMap:assets.coldMap);
    const cdf=new Float64Array(n*n);
    let total=0;
    for(let i=0;i<cdf.length;i++){
      total+=Math.pow(binary.charCodeAt(i)/255,.85);
      cdf[i]=total;
    }
    return (rand) => {
      const v=rand()*total;
      let l=0,r=cdf.length-1;
      while(l<r){const m=(l+r)>>1;if(cdf[m]<v)l=m+1;else r=m;}
      return [(l%n+rand())/n-.5,.5-(Math.floor(l/n)+rand())/n];
    };
  }
  function galaxy(texture, radius, hand, count) {
    const group=new T.Group();
    const wave={...uniforms,uRadius:{value:radius},uHand:{value:hand}};
    const disc=new T.Mesh(new T.PlaneGeometry(radius*2,radius*2,76,76),new T.ShaderMaterial({
      ...soft, forceSinglePass:true, uniforms:{...wave,map:{value:texture}}, vertexShader:warp+`
        varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(discWarp(position),1.);}
      `, fragmentShader:`
        uniform sampler2D map;varying vec2 vUv;
        void main(){vec4 dust=texture2D(map,vUv);gl_FragColor=vec4(dust.rgb,dust.a);}
      `
    }));
    disc.renderOrder=hand>0?1:0;
    group.add(disc);
    const rand=seeded(hand>0?917371:77281), sample=positionsFromTexture(texture);
    const pos=[], colors=[], props=[];
    for(let i=0;i<count;i++) {
      let [x,y]=sample(rand);
      x*=2*radius; y*=2*radius;
      const r=Math.sqrt(x*x+y*y)/radius;
      const z=gaussian(rand)*(.035+.12*r+.18*Math.exp(-6*r))*(rand()<.13?3.8:1);
      pos.push(x,y,z);
      const lum=rand(),mix=rand(),c=hand>0?[1,.72+.25*mix,.55+.42*mix]:[.56+.42*mix,.69+.28*mix,1];
      colors.push(...c);
      props.push(.60+1.52*Math.pow(lum,3)+(lum>.987?1.7+3.2*rand():0),.30+.55*Math.pow(lum,2),lum>.983?1:0);
    }
    const stars=makePoints(pos,colors,props,starPrelude+warp+`
      void main(){
        vec4 mv=modelViewMatrix*vec4(discWarp(position),1.);
        projectStar(mv,clamp(8.5/max(.1,-mv.z),.66,4.8),.91);
      }
    `,wave,5);
    group.add(stars);
    scene.add(group);
    return group;
  }
  const warm=galaxy(amber,4.48,1,options.light?18500:33800);
  const cool=galaxy(azure,3.30,-1,options.light?13500:24600);

  const bridgePath=`
    uniform vec3 uA,uB;
    uniform float uTime, uDrift;
    vec3 current(float s, float off, float deep) {
      float p=uTime/20., t=clamp(s,0.,1.), it=1.-t;
      vec3 start=uA+vec3(1.42,.26,-.1), end=uB+vec3(-1.00,-.29,.06);
      vec3 p1=start+vec3(1.07,1.24+.32*p,-.78);
      vec3 p2=end+vec3(-1.34,-.85+.25*p,1.04);
      vec3 position=it*it*it*start+3.*it*it*t*p1+3.*it*t*t*p2+t*t*t*end;
      float span=sin(t*3.14159);
      position.y+=.15*span*sin(7.*t+p*1.4+uDrift*.18);
      position+=off*vec3(.04,.83,.51)*(1.+.16*sin(t*13.+p*.9));
      position.z+=deep;
      return position;
    }
    float unfolding(float s){
      float front=smoothstep(.06,.63,uTime/20.);
      float nearCore=abs(s-.5)*2.;
      return .06+.94*smoothstep(.85,1.13,nearCore+front*1.12);
    }
  `;
  const ribbon=new T.Mesh(new T.PlaneGeometry(1,2,136,16),new T.ShaderMaterial({
    ...additive,forceSinglePass:true,uniforms:{...uniforms,map:{value:thread}},
    vertexShader:bridgePath+`
      varying vec2 vUv;
      void main(){vUv=uv;vec3 p=current(uv.x,position.y*(.83+.41*abs(uv.x-.5)*2.),0.);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}
    `,fragmentShader:bridgePath+`
      varying vec2 vUv; uniform sampler2D map;
      void main(){vec4 v=texture2D(map,vUv);gl_FragColor=vec4(v.rgb, v.a*unfolding(vUv.x)*.69);}
    `
  }));
  ribbon.frustumCulled=false;
  ribbon.renderOrder=2;
  scene.add(ribbon);
  const rand=seeded(530356), pos=[],color=[],props=[];
  const n=options.light?13600:24900;
  for(let i=0;i<n;i++) {
    const s=rand(),lane=Math.floor(rand()*11),stream=Math.sin(s*(9+lane*.37)+lane*4.1)*.10+Math.sin(lane*12.7)*.18;
    const scattering=.046+.14*Math.abs(2*s-1)+.035*Math.sin(35*s+lane);
    pos.push(s,stream+gaussian(rand)*scattering,gaussian(rand)*(.09+.17*Math.abs(2*s-1)));
    const dust=rand();
    color.push(1-.49*s+.05*dust,.73+.12*s+.07*dust,.51+.49*s+.10*dust);
    const l=rand();
    props.push(.56+1.6*Math.pow(l,3)+(l>.986?1.8:0),.26+.58*l*l,l>.989?1:0);
  }
  scene.add(makePoints(pos,color,props,starPrelude+bridgePath+`
    void main(){
      float s=position.x;
      float ripple=sin(3.14159*s);
      s+=ripple*.026*sin(s*15.+(uTime+uDrift)*.14+position.y*2.);
      vec3 p=current(s,position.y,position.z);
      vec4 mv=viewMatrix*vec4(p,1.);
      projectStar(mv,clamp(8.7/max(.1,-mv.z),.64,6.0),unfolding(s));
    }
  `,uniforms,6));
  // A sparse off-plane halo gives the low pass true foreground parallax.
  const hp=[],hc=[],hs=[];
  for(let i=0;i<2600;i++) {
    const x=gaussian(rand)*5.1, z=gaussian(rand)*3.1, y=gaussian(rand)*1.3;
    hp.push(x,y,z);
    const k=rand();
    hc.push(.73+.22*k,.78+.12*k,.97-.16*k);
    hs.push(.6+1.75*Math.pow(k,8),.09+.37*k*k,0);
  }
  scene.add(makePoints(hp,hc,hs,starPrelude+`
    void main(){vec4 mv=modelViewMatrix*vec4(position,1.);projectStar(mv,clamp(7./max(.1,-mv.z),.55,4.25),.82);}
  `,uniforms,7));

  // A smooth cubic camera rail has no cuts and never crosses a nucleus.
  const eyes=[
    [-3.60,.47,6.06],[-2.61,.41,5.50],[-.90,.21,4.92],[.62,-.20,4.70],
    [1.58,.33,6.05],[2.10,2.62,9.45],[1.96,5.55,12.04]
  ].map(p=>vector(...p));
  const sights=[
    [-1.79,-.16,.25],[-1.60,-.11,.18],[-.95,.05,.14],[.12,.44,.04],
    [.34,.39,-.08],[.20,.32,-.11],[-.03,.14,-.12]
  ].map(p=>vector(...p));
  const eyeRail=new T.CatmullRomCurve3(eyes,false,'catmullrom',.43);
  const gazeRail=new T.CatmullRomCurve3(sights,false,'catmullrom',.43);
  let width=1,h=1;
  function resize(w,screenH){
    width=w;h=screenH;
    renderer.setSize(w,screenH,false);
    camera.aspect=w/screenH; height.value=screenH;
  }
  const target=vector(0,0,0),eye=vector(0,0,0);
  function render(time,mode='film',orbit={}){
    const s=clamp(time,0,20), t=s/20;
    seconds.value=s;
    drift.value=mode==='film'?0:(orbit.clock||0)*(mode==='cover' ? .20 : 1);
    aCenter.value.set(-1.95-2.18*t,-.42-.12*t,1.58-1.31*t+.24*Math.sin(t*Math.PI));
    bCenter.value.set(1.10+2.94*t,.88+.29*t,-3.38+2.70*t-.16*Math.sin(t*Math.PI));
    warm.position.copy(aCenter.value);cool.position.copy(bCenter.value);
    warm.rotation.set(-1.42+.095*t,-.10+.09*t,.19+.105*t,'ZXY');
    cool.rotation.set(-.68-.10*t,.12-.07*t,-.47+.06*t,'ZXY');
    if(mode==='cover'){
      const phase=(orbit.clock||0)*.05, portrait=width<h;
      const az=.105+.042*Math.sin(phase), el=.445+.025*Math.sin(phase*.69);
      const dist=portrait?17.5:13.65;
      target.set(portrait?-.10:-1.15,portrait?-1.28:-1.18,-.08);
      eye.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(dist).add(target);
      camera.fov=portrait?T.MathUtils.radToDeg(2*Math.atan(Math.tan(38*Math.PI/360)/camera.aspect)):42;
    } else if(mode==='orbit'){
      const az=orbit.az,el=orbit.el,d=orbit.dist;
      target.set(0,.18,-.16);
      eye.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(d).add(target);
      camera.fov=width<h?T.MathUtils.radToDeg(2*Math.atan(Math.tan(42*Math.PI/360)/camera.aspect)):43;
    } else {
      // Ease out into the wide composition without pausing the stars.
      const tcam=t<.85?t:(.85+.15*(1-Math.pow(1-(t-.85)/.15,1.36)));
      eyeRail.getPoint(clamp(tcam,0,1),eye);
      gazeRail.getPoint(clamp(tcam,0,1),target);
      camera.fov=44.8-3.1*smooth(.58,1,t);
      if(width<h) camera.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(camera.fov*Math.PI/360)*1.36/camera.aspect));
    }
    camera.position.copy(eye);
    camera.up.set(0,1,0);
    camera.lookAt(target);
    if(mode==='film') camera.rotateZ((-0.031 + .052*Math.sin(t*Math.PI*1.8))*Math.sin(t*Math.PI));
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
  }
  return {resize,render,renderer,counts:{disk:options.light?32000:58400,bridge:n}};
}

