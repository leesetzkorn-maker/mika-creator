import { isVerified } from './age-gate.mjs';
const MOBILE = matchMedia('(max-width: 700px)');
const MOTION = matchMedia('(prefers-reduced-motion: reduce)');
const imageCache = new Map();
function loadImage(src) {
  if (!imageCache.has(src)) imageCache.set(src, new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve();img.onerror=()=>{imageCache.delete(src);reject(new Error('Image unavailable'));};img.src=src;
  }));
  return imageCache.get(src);
}
export async function initHero() {
  const hero=document.querySelector('#hero'),bg=document.querySelector('#hero-bg');
  if(!hero||!bg)return;
  let images;
  try{const response=await fetch('/assets/data/red-editorial.json');if(!response.ok)throw new Error();const set=(await response.json()).images;images=[set[2],set[0],set[1]];}catch{hero.classList.add('no-image','loaded');return;}
  const layers=images.map(image=>{const layer=document.createElement('div');layer.className='hero-slide';layer.setAttribute('aria-hidden','true');bg.append(layer);return layer;});
  let index=-1,timer,sequence=0,paused=false,inView=true;
  const source=image=>!isVerified()?image.urls.blur:MOBILE.matches?image.urls.mobile:image.urls.desktop;
  const eligible=()=>!paused&&!MOTION.matches&&!document.hidden&&inView&&isVerified()&&!hero.contains(document.activeElement);
  const schedule=()=>{clearTimeout(timer);if(eligible())timer=setTimeout(()=>go((index+1)%images.length),6000);};
  function paint(i,src){layers[i].style.backgroundImage=`url('${src}')`;layers[i].style.backgroundPosition=MOBILE.matches?images[i].mobile:images[i].desktop;layers[i].dataset.src=src;}
  async function go(i){
    clearTimeout(timer);const request=++sequence;let src=source(images[i]);
    try{await loadImage(src);if(src!==source(images[i])){src=source(images[i]);await loadImage(src);}}catch{if(index<0&&i+1<images.length)return go(i+1);hero.classList.add('loaded');schedule();return;}
    if(request!==sequence)return;
    paint(i,src);layers.forEach((layer,j)=>{layer.classList.toggle('is-active',j===i);layer.setAttribute('aria-hidden',String(j!==i));});
    const changed=index!==i;index=i;hero.dataset.heroActive=images[i].slug;hero.classList.add('loaded');bg.classList.remove('is-blur');
    if(changed){const event={slide_number:i+1,slide_image:images[i].slug};window.MikaTrack?.('hero_slide_view',event);window.MikaDbTrack?.('hero_slide_view',{...event,location:'hero'});}
    schedule();
    // Only the immediately following photograph is warmed, after verification.
    if(isVerified()&&!MOTION.matches&&inView)loadImage(source(images[(i+1)%images.length])).catch(()=>{});
  }
  const pause=document.createElement('button');pause.type='button';pause.className='hero-photo-pause';pause.textContent='Pause photos';pause.setAttribute('aria-label','Pause hero slideshow');pause.setAttribute('aria-pressed','false');hero.append(pause);
  pause.addEventListener('click',()=>{paused=!paused;pause.textContent=paused?'Play photos':'Pause photos';pause.setAttribute('aria-label',paused?'Play hero slideshow':'Pause hero slideshow');pause.setAttribute('aria-pressed',String(paused));schedule();});
  const motion=()=>{pause.hidden=MOTION.matches;schedule();};MOTION.addEventListener('change',motion);motion();
  MOBILE.addEventListener('change',()=>{if(index>=0)go(index);});
  document.addEventListener('mika:gate-passed',()=>go(Math.max(0,index)));
  document.addEventListener('visibilitychange',schedule);
  hero.addEventListener('focusin',()=>clearTimeout(timer));hero.addEventListener('focusout',()=>setTimeout(schedule,0));
  new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;schedule();},{threshold:.05}).observe(hero);
  document.addEventListener('keydown',event=>{if(!inView||!isVerified()||event.target.closest('input,textarea,select,[contenteditable]'))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go((index+(event.key==='ArrowRight'?1:-1)+images.length)%images.length);}});
  await go(0);
}
