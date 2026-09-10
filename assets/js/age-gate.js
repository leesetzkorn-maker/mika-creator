(function(){
  var KEY = 'mika_age_verified';
  if (localStorage.getItem(KEY) === 'yes') return;

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  var gate = document.createElement('div');
  gate.id = 'ageGate';
  gate.innerHTML = '<div class="age-card" id="ageCard">' +
    '<div class="age-logo">MIKA <span>CREATOR</span></div>' +
    '<div class="age-tag">18+ Adult Content</div>' +
    '<div class="age-line"></div>' +
    '<h1>Are you 18 or older?</h1>' +
    '<p class="age-sub">This website contains adult content intended for people aged 18 and over. Please confirm your age to continue.</p>' +
    '<div class="age-btns">' +
      '<button class="age-btn primary" id="ageYes">Yes, I am 18+</button>' +
      '<button class="age-btn ghost" id="ageNo">No, I am under 18</button>' +
    '</div>' +
    '<div class="age-note">By entering you confirm you are of legal age in your country of residence.</div>' +
  '</div>';
  document.body.appendChild(gate);

  document.getElementById('ageYes').addEventListener('click', function(){
    localStorage.setItem(KEY, 'yes');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    gate.style.display = 'none';
  });

  document.getElementById('ageNo').addEventListener('click', function(){
    var card = document.getElementById('ageCard');
    card.classList.add('age-denied');
    card.innerHTML = '<div class="age-logo">MIKA <span>CREATOR</span></div>' +
      '<h1 style="margin-top:16px">Sorry</h1>' +
      '<p class="age-sub">You must be 18 or older to enter this website.</p>' +
      '<div class="age-btns"><button class="age-btn ghost" id="ageExit">Exit</button></div>';
    document.getElementById('ageExit').addEventListener('click', function(){
      try { window.close(); } catch(e){}
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#09090d;color:rgba(255,255,255,.4);font-family:system-ui;text-align:center;padding:24px"><p>You must be 18 or older to access this website.</p></div>';
    });
  });
})();
