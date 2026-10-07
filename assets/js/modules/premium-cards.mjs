import { isVerified } from './age-gate.mjs';

export function initPremiumCards() {
  const cards=[...document.querySelectorAll('[data-tilt]')];
  if(!cards.length)return;
  const photos=()=>cards.forEach(card=>card.querySelectorAll('[data-sharp]').forEach(img=>{img.src=img.dataset.sharp;delete img.dataset.sharp;}));
  if(isVerified())photos();else document.addEventListener('mika:gate-passed',photos,{once:true});
  // Existing enquiry selection gets the same picture as its source card.
  const field=document.querySelector('#cb-package');
  const requestImage=document.querySelector('.request-photo-card .photo-depth');
  if(field&&requestImage)fetch('/assets/data/red-editorial.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(({images})=>{
    const update=()=>{const index=field.value==='video-call'?1:Math.max(0,['content-1','content-2','content-3','content-4'].indexOf(field.value));const image=images[index];if(!image)return;requestImage.dataset.sharp=image.urls.card;requestImage.src=isVerified()?image.urls.card:image.urls.blur;};
    field.addEventListener('change',update);update();
  }).catch(()=>{});
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  for(const card of cards){
    let frame=0, point=null;
    const neutral=()=>{if(frame)cancelAnimationFrame(frame);frame=0;point=null;card.classList.remove('is-pointed');for(const name of ['--rx','--ry','--px','--py','--light-x','--light-y'])card.style.removeProperty(name);};
    card.addEventListener('pointermove',event=>{
      if(!fine.matches||reduced.matches||event.pointerType!=='mouse')return;
      point={x:event.clientX,y:event.clientY};
      if(frame)return;
      frame=requestAnimationFrame(()=>{frame=0;if(!point)return;const box=card.getBoundingClientRect();const x=Math.max(-1,Math.min(1,((point.x-box.left)/box.width-.5)*2));const y=Math.max(-1,Math.min(1,((point.y-box.top)/box.height-.5)*2));card.classList.add('is-pointed');card.style.setProperty('--rx',`${-y*5}deg`);card.style.setProperty('--ry',`${x*5}deg`);card.style.setProperty('--px',`${-x*7}px`);card.style.setProperty('--py',`${-y*7}px`);card.style.setProperty('--light-x',`${(x+1)*50}%`);card.style.setProperty('--light-y',`${(y+1)*50}%`);});
    });
    card.addEventListener('pointerleave',neutral);card.addEventListener('pointercancel',neutral);
    fine.addEventListener('change',neutral);reduced.addEventListener('change',neutral);
    // A glow pulse gives tap feedback without moving or intercepting links.
    card.addEventListener('pointerdown',()=>{if(reduced.matches)return;card.classList.remove('is-pressed');void card.offsetWidth;card.classList.add('is-pressed');});
    card.addEventListener('animationend',()=>card.classList.remove('is-pressed'));
  }
}
