(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cover=$('cover'), transport=$('transport'), orbitTools=$('orbit-tools'), stage=$('stage');
  const timeline=$('timeline'), score=$('score'), video=$('movie'), sound=$('sound');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const duration=20, light=matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const defaultOrbit={az:.13,el:.43,dist:13.6};
  let orbit={...defaultOrbit}, time=0, playing=false, mode='cover', soundEnabled=true;
  let engine=null, engineType='pending', canvas=$('galaxy'), w=0,h=0,dpr=1,quality=1;
  let last=0, playOrigin=0, visualClock=0, orbitClock=0, dirty=true, frame=0, chromeTimer=0;
  let refreshAccumulator=0,samples=0,loadScore=0,lastFallbackDraw=0;
  let pointerBaseline=null,activeTag=0,directorResume=0;
  const pointers=new Map();
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=s=>'00:'+String(Math.floor(clamp(s,0,20)+.00001)).padStart(2,'0');
  function showStatus(text){$('status').textContent=text}
  function updateControls(){
    const pct=time/duration*100;
    timeline.value=String(time);
    timeline.style.setProperty('--pct',pct+'%');
    timeline.setAttribute('aria-valuetext',fmt(time)+' / 00:20');
    $('time-display').innerHTML=fmt(time)+' <i>/</i> 00:20';
    $('chapter').textContent=time<8?'近掠':time<14?'星桥':'远望';
    document.body.classList.toggle('still',!playing);
    $('playlabel').textContent=playing?'暂停':time>=19.99?'重播':'继续';
    sound.setAttribute('aria-pressed',String(soundEnabled));
    sound.setAttribute('aria-label',soundEnabled?'关闭原声':'打开原声');
    document.body.classList.toggle('audible',soundEnabled && playing && mode==='film');
  }
  function showChrome(){
    clearTimeout(chromeTimer);
    document.body.classList.remove('chrome-hidden');
    if(mode==='film' && playing){
      chromeTimer=setTimeout(()=>{
        if(!transport.matches(':hover') && !transport.matches(':focus-within'))document.body.classList.add('chrome-hidden');
      },3200);
    }
  }
  function setMode(value){
    mode=value;document.body.dataset.mode=mode;
    cover.hidden=mode!=='cover';transport.hidden=mode!=='film';orbitTools.hidden=mode!=='orbit';
    video.hidden=!(mode==='film' && engineType==='canvas' && !video.error);
    dirty=true;showChrome();updateControls();schedule();
  }
  function setAudioTime(element,t){
    try {if(Math.abs(element.currentTime-t)>.035)element.currentTime=t;} catch {}
  }
  let embeddedMovieURL='';
  function filmURL(){
    const embedded=$('film-bytes');
    if(!embedded) return $('download').href;
    if(!embeddedMovieURL){
      const bytes=atob(embedded.textContent.trim()), parts=[];
      for(let i=0;i<bytes.length;i+=1048576){
        const chunk=bytes.slice(i,i+1048576),buf=new Uint8Array(chunk.length);
        for(let j=0;j<chunk.length;j++)buf[j]=chunk.charCodeAt(j);
        parts.push(buf);
      }
      embeddedMovieURL=URL.createObjectURL(new Blob(parts,{type:'video/mp4'}));
    }
    return embeddedMovieURL;
  }
  $('download').addEventListener('click',()=>{if($('film-bytes'))$('download').href=filmURL();});
  function mediaPlayer(){return engineType==='canvas'&&!video.error?video:score}
  function startClock(t){
    time=clamp(t,0,duration);playOrigin=performance.now()-time*1000;
    playing=true;setMode('film');
    const media=mediaPlayer();score.pause();video.pause();
    if(media===video && !video.getAttribute('src'))video.src=filmURL();
    media.muted=!soundEnabled;setAudioTime(media,time);
    const tag=++activeTag;
    const pending=media.play();
    if(pending)pending.catch(()=>{
      if(tag!==activeTag)return;
      if(media===video && video.error){video.hidden=true;dirty=true;schedule();}
    });
    updateControls();showChrome();
  }
  function pauseFilm(){
    if(mode==='film' && playing)time=currentFilmTime(performance.now());
    ++activeTag;playing=false;score.pause();video.pause();dirty=true;
    updateControls();showChrome();schedule();
  }
  function currentFilmTime(now){
    if(mode==='film' && engineType==='canvas' && !video.error && !video.paused && video.readyState>=2){
      return Math.min(duration,video.currentTime);
    }
    return clamp((now-playOrigin)/1000,0,duration);
  }
  function seek(t){
    time=clamp(t,0,duration);playOrigin=performance.now()-time*1000;
    setAudioTime(mediaPlayer(),time);dirty=true;updateControls();showChrome();schedule();
  }
  function goHome(){
    pauseFilm();time=0;visualClock=0;pointerBaseline=null;
    setMode('cover');showStatus('双星潮汐首页');
  }
  function explore(){
    const from=mode;
    orbitClock=from==='cover'?visualClock*.20:0;
    pauseFilm();
    directorResume=from==='film'?time:0;
    if(from==='cover'){time=18.5;orbit={...defaultOrbit};}
    else if(from==='film')orbit={...defaultOrbit,dist:12.8};
    setMode('orbit');showStatus('已进入自由探索');stage.focus({preventScroll:true});
  }
  function togglePlay(){
    if(mode!=='film')startClock(0);
    else if(playing)pauseFilm();
    else startClock(time>=19.99?0:time);
  }
  function schedule(){
    if(!document.hidden&&!frame)frame=requestAnimationFrame(tick);
  }
  function resize(){
    const rect=stage.getBoundingClientRect();
    const base=Math.min(window.devicePixelRatio||1,light?1.45:1.65);
    const cap=engineType==='canvas'?1050000:2400000;
    dpr=Math.min(base*quality,Math.sqrt(cap/Math.max(1,rect.width*rect.height)));
    w=Math.max(2,Math.round(rect.width*dpr));h=Math.max(2,Math.round(rect.height*dpr));
    if(engine)engine.resize(w,h);dirty=true;schedule();
  }
  function tick(now){
    frame=0;if(document.hidden)return;
    const delta=last?clamp((now-last)/1000,0,.12):0;last=now;
    if(mode==='film' && playing){
      time=currentFilmTime(now);
      if(time>=duration-.0001){time=duration;pauseFilm();time=duration;updateControls();}
      else if(now-refreshAccumulator>75){refreshAccumulator=now;updateControls();}
    }
    if(!motion.matches && mode==='cover')visualClock+=delta;
    if(!motion.matches && mode==='orbit')orbitClock+=delta;
    if(engine){
      const live=(mode==='film'&&playing&&video.hidden)||(mode!=='film'&&!motion.matches);
      const isFlat=engineType==='canvas';
      if(dirty || live && (!isFlat || now-lastFallbackDraw>47)){
        const st=mode==='cover'?(18.5+(motion.matches?0:.60*Math.sin(visualClock*.075))):time;
        engine.render(st,mode,mode==='cover'?{clock:visualClock}:{...orbit,clock:orbitClock});
        dirty=false;lastFallbackDraw=now;
      }
      if(live && delta>.001 && now>1600){
        loadScore+=delta;samples++;
        if(samples>=55){
          if(loadScore/samples>.055 && quality>.67){quality=Math.max(.64,quality*.82);resize();}
          samples=0;loadScore=0;
        }
      }
    }
    if(playing || (mode!=='film' && !motion.matches && engine) || (dirty && engineType==='pending'))schedule();
  }
  async function load(){
    try{
      const attrs={alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'};
      const context=canvas.getContext('webgl2',attrs)||canvas.getContext('webgl',attrs);
      if(!context)throw new Error('WebGL unavailable');
      engine=await createTidalScene(canvas,TIDAL_ASSETS,{light,context});engineType='webgl';
    }catch{
      const replacement=document.createElement('canvas');
      replacement.id='galaxy';replacement.setAttribute('aria-hidden','true');
      canvas.replaceWith(replacement);canvas=replacement;
      engineType='canvas';
      try{
        engine=await createTidalScene(canvas,TIDAL_ASSETS,{light:true,renderer:createCanvasStage(canvas)});
      } catch {
        engine=null;$('explore').hidden=true;$('orbit-switch').hidden=true;showStatus('当前设备可观看预渲染影片');
      }
      if(mode==='film'){
        if(playing)startClock(time);
        else {video.src=filmURL();setAudioTime(video,time);video.hidden=false;}
      }
    }
    resize();
    if(engine){
      engine.render(mode==='cover'?18.5:time,mode,mode==='cover'?{clock:0}:orbit);
      document.body.classList.add('scene-ready');
    }
    document.body.dataset.renderer=engineType;dirty=false;schedule();
  }
  const buttons={watch:()=>startClock(0),explore,home:goHome,playpause:togglePlay,'orbit-switch':explore,
    direct:()=>startClock(directorResume>=19.99?0:directorResume),reset:()=>{orbit={...defaultOrbit};dirty=true;schedule();showStatus('视角已复位')}};
  for(const [id,fn] of Object.entries(buttons))$(id).addEventListener('click',fn);
  cover.querySelectorAll('[data-seek]').forEach(button=>button.addEventListener('click',()=>startClock(Number(button.dataset.seek))));
  sound.addEventListener('click',()=>{
    soundEnabled=!soundEnabled;score.muted=video.muted=!soundEnabled;
    if(soundEnabled&&playing&&mediaPlayer().paused){setAudioTime(mediaPlayer(),time);mediaPlayer().play().catch(()=>{});}
    updateControls();showChrome();
  });
  timeline.addEventListener('input',()=>{seek(Number(timeline.value));});
  video.addEventListener('ended',()=>{if(mode==='film'){pauseFilm();time=duration;updateControls();}});
  video.addEventListener('error',()=>{
    if(mode!=='film'||engineType!=='canvas')return;
    video.hidden=true;dirty=true;
    if(playing){playOrigin=performance.now()-time*1000;setAudioTime(score,time);score.muted=!soundEnabled;score.play().catch(()=>{});}
    schedule();
  });
  $('fullscreen').addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if($('experience').requestFullscreen)await $('experience').requestFullscreen();
      else if(!video.hidden&&video.webkitEnterFullscreen)video.webkitEnterFullscreen();
      else document.body.classList.toggle('chrome-hidden');
    }catch{showStatus('当前浏览器已使用可用的最大视口');}
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏观看');resize();});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function resetPointerBaseline(){
    const p=[...pointers.values()];
    pointerBaseline=p.length?{x:p[0].x,y:p[0].y,az:orbit.az,el:orbit.el,dist:orbit.dist,
      span:p.length>1?Math.max(2,distance(p[0],p[1])):0}:null;
  }
  stage.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    showChrome();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});stage.setPointerCapture(e.pointerId);resetPointerBaseline();
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!pointerBaseline){showChrome();return;}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const p=[...pointers.values()],base=pointerBaseline,dx=p[0].x-base.x,dy=p[0].y-base.y;
    if(mode!=='orbit'){
      if(!engine||Math.hypot(dx,dy)<7&&p.length===1)return;
      explore();resetPointerBaseline();return;
    }
    if(p.length>1&&base.span){orbit.dist=clamp(base.dist*base.span/Math.max(2,distance(p[0],p[1])),7,24);}
    else{orbit.az=base.az-dx*.006;orbit.el=clamp(base.el+dy*.005,-1.10,1.36);}
    dirty=true;schedule();
  });
  function pointerUp(e){
    pointers.delete(e.pointerId);resetPointerBaseline();
  }
  stage.addEventListener('pointerup',pointerUp);stage.addEventListener('pointercancel',pointerUp);
  stage.addEventListener('lostpointercapture',pointerUp);
  stage.addEventListener('wheel',e=>{
    if(mode!=='orbit')return;e.preventDefault();
    orbit.dist=clamp(orbit.dist*Math.exp(clamp(e.deltaY,-180,180)*.0013),7,24);dirty=true;schedule();
  },{passive:false});
  document.addEventListener('keydown',e=>{
    if(e.altKey||e.metaKey||e.ctrlKey)return;
    if(e.key==='Escape' && !document.fullscreenElement){goHome();$('watch').focus();return;}
    if(e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement)return;
    if(e.code==='Space'){e.preventDefault();togglePlay();return;}
    if(mode!=='orbit')return;
    const k=e.key;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_'].includes(k))return;
    e.preventDefault();
    if(k==='ArrowLeft')orbit.az-=.10;
    if(k==='ArrowRight')orbit.az+=.10;
    if(k==='ArrowUp')orbit.el=clamp(orbit.el+.09,-1.10,1.36);
    if(k==='ArrowDown')orbit.el=clamp(orbit.el-.09,-1.10,1.36);
    if(k==='+'||k==='=')orbit.dist=clamp(orbit.dist*.91,7,24);
    if(k==='-'||k==='_')orbit.dist=clamp(orbit.dist*1.09,7,24);
    dirty=true;schedule();
  });
  document.addEventListener('pointermove',()=>{if(mode==='film')showChrome();},{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(playing)pauseFilm();if(frame)cancelAnimationFrame(frame);frame=0;}
    else {last=0;dirty=true;schedule();}
  });
  motion.addEventListener?.('change',()=>{dirty=true;schedule();});
  new ResizeObserver(resize).observe(stage);
  updateControls();load();
})();

