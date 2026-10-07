import { CATEGORIES, chooseTask, randomIndex } from './spin-tasks.mjs';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PUBLIC_TASKS = {
  d2: 'Give your best 10-second introduction, or write it below.',
  d3: 'Imagine your most creative date-night selfie. Describe the setting.',
  d4: 'Try your favourite dance move, or describe the move you chose.',
  d8: 'Describe your perfect date-night outfit.',
  p3: 'Choose a colour that matches your mood and describe why.',
};

export function initNaughtySpin() {
  const game = document.querySelector('#naughty-spin');
  if (!game || game.dataset.initialized) return;
  game.dataset.initialized = 'true';
  const $ = selector => game.querySelector(selector);
  const style = document.createElement('link'); style.rel='stylesheet'; style.href='/assets/css/game-session.css'; document.head.append(style);
  $('.spin-intro').insertAdjacentHTML('afterend', `<form class="game-start" id="game-start"><label for="game-nickname">Your nickname</label><input id="game-nickname" maxlength="40" autocomplete="off" required placeholder="What should we call you?"><button class="game-action" type="submit">Let's play</button></form>`);
  $('.spin-note').insertAdjacentHTML('afterend', `<div id="game-session" hidden><div class="game-session-head"><strong id="game-player"></strong><span id="game-counts"></span></div><section class="game-challenge" id="game-challenge" hidden aria-labelledby="game-challenge-title"></section><details class="game-history"><summary>Your playful moments</summary><div id="game-history"></div></details><button class="game-action game-finish" id="game-finish" type="button">Finish game</button><p class="game-status" id="game-status" role="status" aria-live="polite"></p></div>`);
  const wheel=$('#spin-wheel'), button=$('#spin-button'), challenge=$('#game-challenge');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let nickname='', rounds=[], rotation=0, spinning=false, finished=false;
  const current=()=>rounds.at(-1);
  button.disabled=true;
  function render() {
    $('#game-player').textContent=nickname;
    $('#game-counts').textContent=`${rounds.length} rounds · ${rounds.filter(r=>r.status==='completed').length} completed ✓ · ${rounds.filter(r=>r.status==='skipped').length} skipped`;
    $('#game-history').innerHTML=rounds.map(r=>`<article><strong>Round ${r.number} · ${esc(r.task.type)} · ${r.status==='completed'?'✓ Completed':esc(r.status)}</strong><p>${esc(r.task.text)}</p>${r.answer?`<p class="game-answer">${esc(r.answer)}</p>`:''}</article>`).join('');
    button.disabled=!nickname||spinning||finished;
    $('#game-finish').disabled=!rounds.length||spinning||finished;
    const round=current(); challenge.hidden=!round;
    if(!round)return;
    const locked=round.status!=='pending'||finished||spinning;
    challenge.innerHTML=`<p class="eyebrow">ROUND ${round.number} · ${esc(round.task.type)} ${round.status==='completed'?'· ✓':''}</p><h4 id="game-challenge-title">${esc(round.task.text)}</h4><p class="game-voluntary-note">A little fun, entirely your choice. Skip anything, anytime.</p><label>Your answer (optional)<textarea id="game-answer" maxlength="2000" rows="3" placeholder="Just for you — make it playful…" ${locked?'disabled':''}>${esc(round.answer)}</textarea></label><div class="game-task-actions"><button class="game-action" id="game-complete" type="button" ${locked?'disabled':''}>Complete Task</button><button class="game-action game-secondary" id="game-skip" type="button" ${locked?'disabled':''}>Skip</button><button class="game-action game-secondary" id="game-next" type="button" ${spinning||finished?'disabled':''}>Spin Again</button></div><small>Spinning again skips an unfinished challenge.</small>`;
    $('#game-answer').addEventListener('input',e=>{round.answer=e.target.value.slice(0,2000);});
    $('#game-complete').addEventListener('click',()=>{if(locked)return;round.status='completed';render();});
    $('#game-skip').addEventListener('click',()=>{if(locked)return;round.status='skipped';render();});
    $('#game-next').addEventListener('click',()=>button.click());
  }
  $('#game-start').addEventListener('submit',e=>{e.preventDefault();nickname=$('#game-nickname').value.trim().slice(0,40);if(!nickname)return;$('#game-start').hidden=true;$('#game-session').hidden=false;render();});
  button.addEventListener('click',async()=>{
    if(!nickname||spinning||finished)return;
    if(current()?.status==='pending')current().status='skipped';
    spinning=true;render();button.textContent='Spinning…';game.classList.add('is-spinning');game.classList.remove('has-result');$('#spin-result').setAttribute('aria-busy','true');
    const index=randomIndex(8), target=(360-index*45)%360, next=rotation+1800+(target-rotation%360+360)%360;
    if(!motion.matches){const animation=wheel.animate([{transform:`rotate(${rotation}deg)`},{transform:`rotate(${next}deg)`}],{duration:4200,easing:'cubic-bezier(.12,.74,.12,1)',fill:'forwards'});const stop=()=>{if(motion.matches)animation.finish();};motion.addEventListener('change',stop);try{await animation.finished;}catch{}wheel.style.transform=`rotate(${next}deg)`;animation.cancel();motion.removeEventListener('change',stop);}else wheel.style.transform=`rotate(${next}deg)`;
    rotation=next;spinning=false;game.dataset.resultIndex=String(index);$('#spin-result-text').textContent=CATEGORIES[index];$('#spin-result').setAttribute('aria-busy','false');game.classList.remove('is-spinning');game.classList.add('has-result');
    const task=chooseTask(index,rounds.map(r=>r.task.id)); if(PUBLIC_TASKS[task.id])task.text=PUBLIC_TASKS[task.id];
    rounds.push({number:rounds.length+1,task,status:'pending',answer:''});button.textContent='Spin Again';render();
    challenge.classList.remove('challenge-arrived');void challenge.offsetWidth;challenge.classList.add('challenge-arrived');$('#game-status').textContent=`Round ${rounds.length}: your next playful moment is ready.`;
  });
  $('#game-finish').addEventListener('click',()=>{if(spinning||finished)return;if(current()?.status==='pending')current().status='skipped';finished=true;render();$('#game-status').textContent='A little mystery, a little confidence. Thanks for playing.';$('#game-finish').hidden=true;const again=document.createElement('button');again.className='game-action';again.type='button';again.textContent='Play another game';again.addEventListener('click',()=>{rounds=[];finished=false;$('#game-finish').hidden=false;again.remove();button.textContent='Spin the Wheel';$('#spin-result-text').textContent="What will Mika's wheel choose?";$('#game-status').textContent='';render();});$('#game-session').append(again);});
}
