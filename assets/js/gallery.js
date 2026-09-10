(function(){
  var likes = JSON.parse(localStorage.getItem('mika_likes') || '{}');
  var dislikes = JSON.parse(localStorage.getItem('mika_dislikes') || '{}');

  function saveLikes(){ localStorage.setItem('mika_likes', JSON.stringify(likes)); }
  function saveDislikes(){ localStorage.setItem('mika_dislikes', JSON.stringify(dislikes)); }

  function key(cat, i){ return cat + '|' + i; }

  function renderActions(wrap, cat, i){
    var k = key(cat, i);
    var actions = document.createElement('div');
    actions.className = 'photo-actions';

    var likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn like-btn' + (likes[k] ? ' liked' : '');
    likeBtn.innerHTML = (likes[k] ? '\u2764\uFE0F' : '\u2661') + ' <span>' + (likes[k] || 0) + '</span>';
    likeBtn.onclick = function(e){
      e.stopPropagation();
      if(likes[k]){ delete likes[k]; } else { likes[k] = 1; delete dislikes[k]; }
      saveLikes(); saveDislikes(); refresh();
    };

    var dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'action-btn dislike-btn' + (dislikes[k] ? ' disliked' : '');
    dislikeBtn.innerHTML = (dislikes[k] ? '\uD83D\uDC4E' : '\u2662') + ' <span>' + (dislikes[k] || 0) + '</span>';
    dislikeBtn.onclick = function(e){
      e.stopPropagation();
      if(dislikes[k]){ delete dislikes[k]; } else { dislikes[k] = 1; delete likes[k]; }
      saveLikes(); saveDislikes(); refresh();
    };

    actions.appendChild(likeBtn);
    actions.appendChild(dislikeBtn);
    wrap.appendChild(actions);

    var countEl = document.createElement('div');
    countEl.className = 'like-count';
    var lCount = likes[k] || 0;
    countEl.textContent = lCount > 0 ? lCount + ' like' + (lCount !== 1 ? 's' : '') : '';
    wrap.appendChild(countEl);
  }

  function refresh(){
    document.querySelectorAll('.cat-photo').forEach(function(wrap){
      var existing = wrap.querySelector('.photo-actions');
      if(existing) existing.remove();
      var existingCount = wrap.querySelector('.like-count');
      if(existingCount) existingCount.remove();
      var cat = wrap.dataset.cat;
      var i = parseInt(wrap.dataset.index, 10);
      renderActions(wrap, cat, i);
    });
  }

  // Lightbox
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.id = 'lightbox';
  lb.innerHTML = '<button class="lb-close" id="lbClose">\u2715</button>' +
    '<button class="lb-nav lb-prev" id="lbPrev">\u2039</button>' +
    '<div class="lb-img-wrap"><img id="lbImg" src="" alt="Mika"></div>' +
    '<button class="lb-nav lb-next" id="lbNext">\u203A</button>' +
    '<div class="lb-counter" id="lbCounter"></div>' +
    '<div class="lb-actions" id="lbActions"></div>';
  document.body.appendChild(lb);

  var lbImg = document.getElementById('lbImg');
  var lbCounter = document.getElementById('lbCounter');
  var lbActions = document.getElementById('lbActions');
  var lbPrev = document.getElementById('lbPrev');
  var lbNext = document.getElementById('lbNext');
  var lbClose = document.getElementById('lbClose');
  var currentPhotos = [];
  var currentCat = '';
  var currentIdx = 0;

  function openLightbox(cat, idx){
    currentCat = cat;
    currentPhotos = [];
    document.querySelectorAll('.cat-photo[data-cat="'+cat+'"]').forEach(function(w){
      currentPhotos.push(w.querySelector('img').src);
    });
    currentIdx = idx;
    showPhoto();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(){
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  function showPhoto(){
    lbImg.src = currentPhotos[currentIdx];
    lbCounter.textContent = (currentIdx + 1) + ' / ' + currentPhotos.length;
    lbActions.innerHTML = '';
    var k = key(currentCat, currentIdx);

    var likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn like-btn' + (likes[k] ? ' liked' : '');
    likeBtn.innerHTML = (likes[k] ? '\u2764\uFE0F' : '\u2661') + ' Like' + (likes[k] ? ' (' + likes[k] + ')' : '');
    likeBtn.onclick = function(){
      if(likes[k]){ delete likes[k]; } else { likes[k] = 1; delete dislikes[k]; }
      saveLikes(); saveDislikes(); showPhoto(); refresh();
    };

    var dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'action-btn dislike-btn' + (dislikes[k] ? ' disliked' : '');
    dislikeBtn.innerHTML = (dislikes[k] ? '\uD83D\uDC4E' : '\u2662') + ' Dislike' + (dislikes[k] ? ' (' + dislikes[k] + ')' : '');
    dislikeBtn.onclick = function(){
      if(dislikes[k]){ delete dislikes[k]; } else { dislikes[k] = 1; delete likes[k]; }
      saveLikes(); saveDislikes(); showPhoto(); refresh();
    };

    lbActions.appendChild(likeBtn);
    lbActions.appendChild(dislikeBtn);
  }

  function next(){ currentIdx = (currentIdx + 1) % currentPhotos.length; showPhoto(); }
  function prev(){ currentIdx = (currentIdx - 1 + currentPhotos.length) % currentPhotos.length; showPhoto(); }

  lbClose.onclick = closeLightbox;
  lbPrev.onclick = prev;
  lbNext.onclick = next;
  lb.onclick = function(e){ if(e.target === lb) closeLightbox(); };

  document.addEventListener('keydown', function(e){
    if(!lb.classList.contains('open')) return;
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowRight') next();
    if(e.key === 'ArrowLeft') prev();
  });

  // Touch swipe
  var touchStartX = 0;
  lb.addEventListener('touchstart', function(e){ touchStartX = e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function(e){
    var diff = touchStartX - e.changedTouches[0].clientX;
    if(Math.abs(diff) > 50){ diff > 0 ? next() : prev(); }
  }, {passive:true});

  // Expose for category pages
  window.MikaGallery = {
    open: openLightbox,
    init: function(){
      document.querySelectorAll('.cat-photo').forEach(function(wrap){
        var cat = wrap.dataset.cat;
        var i = parseInt(wrap.dataset.index, 10);
        renderActions(wrap, cat, i);
        wrap.addEventListener('click', function(){ openLightbox(cat, i); });
      });
    }
  };
})();
