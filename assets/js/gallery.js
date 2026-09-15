(function(){
  // Global likes/dislikes now live in Supabase (see persistence.js).
  // Each visitor can toggle their own vote once per photo.

  var busy = {};

  function key(cat, i){ return cat + '|' + i; }

  function countsFor(cat, i){
    return Persistence.voteCountsFor(key(cat, i));
  }
  function myAction(cat, i){
    return Persistence.myAction(key(cat, i));
  }

  var likeBubble = '&#x2764;&#xFE0F;';
  var likeOutline = '&#x2661;';
  var dislikeBubble = '&#x1F44E;';
  var dislikeOutline = '&#x2662;';

  var probe = document.createElement('div');
  probe.innerHTML = likeBubble;
  likeBubble = probe.innerHTML;
  probe.innerHTML = likeOutline;
  likeOutline = probe.innerHTML;
  probe.innerHTML = dislikeBubble;
  dislikeBubble = probe.innerHTML;
  probe.innerHTML = dislikeOutline;
  dislikeOutline = probe.innerHTML;

  function flashError(wrap, message){
    if (!wrap) return;
    var el = document.createElement('div');
    el.className = 'vote-error';
    el.textContent = message || 'Could not save like. Please try again.';
    wrap.appendChild(el);
    setTimeout(function(){
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
  }

  function renderActions(wrap, cat, i){
    var k = key(cat, i);
    var counts = countsFor(cat, i);
    var mine = myAction(cat, i);
    var actions = document.createElement('div');
    actions.className = 'photo-actions';

    var likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn like-btn' + (mine === 'like' ? ' liked' : '');
    likeBtn.innerHTML = (mine === 'like' ? likeBubble : likeOutline) + ' <span>' + counts.like + '</span>';
    likeBtn.type = 'button';
    likeBtn.onclick = function(e){
      e.stopPropagation();
      if (busy[k]) return;
      busy[k] = true;
      Persistence.toggleVote(k, 'like').then(function(){
        busy[k] = false;
        refresh();
      }).catch(function(err){
        busy[k] = false;
        console.error('Like failed', err);
        flashError(wrap);
      });
    };

    var dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'action-btn dislike-btn' + (mine === 'dislike' ? ' disliked' : '');
    dislikeBtn.innerHTML = (mine === 'dislike' ? dislikeBubble : dislikeOutline) + ' <span>' + counts.dislike + '</span>';
    dislikeBtn.type = 'button';
    dislikeBtn.onclick = function(e){
      e.stopPropagation();
      if (busy[k]) return;
      busy[k] = true;
      Persistence.toggleVote(k, 'dislike').then(function(){
        busy[k] = false;
        refresh();
      }).catch(function(err){
        busy[k] = false;
        console.error('Dislike failed', err);
        flashError(wrap);
      });
    };

    actions.appendChild(likeBtn);
    actions.appendChild(dislikeBtn);
    wrap.appendChild(actions);

    var countEl = document.createElement('div');
    countEl.className = 'like-count';
    var lCount = counts.like;
    countEl.textContent = lCount > 0 ? lCount + ' like' + (lCount !== 1 ? 's' : '') : '';
    wrap.appendChild(countEl);
  }

  function refresh(){
    document.querySelectorAll('.cat-photo').forEach(function(wrap){
      var existing = wrap.querySelector('.photo-actions');
      if (existing) existing.remove();
      var existingCount = wrap.querySelector('.like-count');
      if (existingCount) existingCount.remove();
      var existingErr = wrap.querySelector('.vote-error');
      if (existingErr) existingErr.remove();
      var cat = wrap.dataset.cat;
      var i = parseInt(wrap.dataset.index, 10);
      renderActions(wrap, cat, i);
    });
    if (lb.classList.contains('open')) renderLightboxActions();
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

  function toggleFromLightbox(action){
    var k = key(currentCat, currentIdx);
    if (busy[k]) return;
    busy[k] = true;
    var likeBtn = lbActions.querySelector('.like-btn');
    var dislikeBtn = lbActions.querySelector('.dislike-btn');
    Persistence.toggleVote(k, action).then(function(){
      busy[k] = false;
      renderLightboxActions();
      refresh();
    }).catch(function(err){
      busy[k] = false;
      console.error('Vote failed', err);
      var el = document.createElement('div');
      el.className = 'vote-error';
      el.textContent = 'Could not save. Please try again.';
      lbActions.appendChild(el);
      setTimeout(function(){
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 4000);
    });
  }

  function renderLightboxActions(){
    var k = key(currentCat, currentIdx);
    var counts = countsFor(currentCat, currentIdx);
    var mine = myAction(currentCat, currentIdx);
    lbActions.innerHTML = '';

    var likeBtn = document.createElement('button');
    likeBtn.className = 'action-btn like-btn' + (mine === 'like' ? ' liked' : '');
    likeBtn.type = 'button';
    likeBtn.innerHTML = (mine === 'like' ? likeBubble : likeOutline) + ' Like' + (counts.like ? ' (' + counts.like + ')' : '');
    likeBtn.onclick = function(){ toggleFromLightbox('like'); };

    var dislikeBtn = document.createElement('button');
    dislikeBtn.className = 'action-btn dislike-btn' + (mine === 'dislike' ? ' disliked' : '');
    dislikeBtn.type = 'button';
    dislikeBtn.innerHTML = (mine === 'dislike' ? dislikeBubble : dislikeOutline) + ' Dislike' + (counts.dislike ? ' (' + counts.dislike + ')' : '');
    dislikeBtn.onclick = function(){ toggleFromLightbox('dislike'); };

    lbActions.appendChild(likeBtn);
    lbActions.appendChild(dislikeBtn);
  }

  function showPhoto(){
    lbImg.src = currentPhotos[currentIdx];
    lbCounter.textContent = (currentIdx + 1) + ' / ' + currentPhotos.length;
    renderLightboxActions();
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
        wrap.addEventListener('click', function(){ openLightbox(cat, i); });
      });
      // Render like/dislike buttons once the global votes have loaded.
      Persistence.onReady(function(err){
        refresh();
        if (err && window.console) console.warn('Likes unavailable:', err);
      });
    }
  };
})();