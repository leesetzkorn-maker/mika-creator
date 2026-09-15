// Mika Creator – Persistence layer (Supabase backend)
// Global likes/dislikes and reviews are stored in Supabase so every
// visitor sees the same data. localStorage is only used to remember
// WHICH votes belong to THIS visitor so they can toggle their own vote.
(function(){
  var cfg = window.MIKA_CONFIG || {};
  var client = null;

  var state = {
    loaded: false,
    loading: false,
    loadError: null,
    votes: [],        // rows: { id, record_key, action, voter_id }
    reviews: [],      // rows from reviews table (newest first)
    counts: {},       // record_key -> { like: n, dislike: n }
    mine: {}          // record_key -> 'like' | 'dislike'
  };

  var readyWaiters = [];
  var voterId = null;

  function getClient(){
    if (client) return client;
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return client;
  }

  function getVoterId(){
    if (voterId) return voterId;
    try {
      voterId = localStorage.getItem('mika_voter_id');
      if (!voterId) {
        voterId = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : ('v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12));
        localStorage.setItem('mika_voter_id', voterId);
      }
    } catch (e) {
      voterId = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }
    return voterId;
  }

  // Only ever called once the script tag has loaded @supabase/supabase-js.
  function ensureClient(){
    var c = getClient();
    if (!c) throw new Error('Supabase client unavailable – check the supabase.js script and MIKA_CONFIG.');
    return c;
  }

  function recompute(){
    var counts = {}, mine = {};
    state.votes.forEach(function(row){
      var k = row.record_key;
      counts[k] = counts[k] || { like: 0, dislike: 0 };
      counts[k][row.action] += 1;
      if (row.voter_id === getVoterId()) mine[k] = row.action;
    });
    state.counts = counts;
    state.mine = mine;
  }

  function loadVotes(){
    var c = ensureClient();
    return c.from(cfg.votesTable).select('id,record_key,action,voter_id').then(function(res){
      if (res.error) throw res.error;
      state.votes = (res.data || []).filter(function(r){ return r && r.record_key; });
      recompute();
      return state.votes;
    });
  }

  function loadReviews(){
    var c = ensureClient();
    return c.from(cfg.reviewsTable).select('id,created_at,nickname,comment,service,needs,content,display_date')
      .order('created_at', { ascending: false }).then(function(res){
        if (res.error) throw res.error;
        state.reviews = (res.data || []).slice();
        return state.reviews;
      });
  }

  // Best-effort one-time migration of reviews that were previously stored
  // in this browser's localStorage. Only runs when the server has NO reviews
  // yet (avoids duplicates) and only once per browser.
  function migrateLegacyReviews(){
    var legacy;
    try {
      legacy = JSON.parse(localStorage.getItem('mika_reviews') || '[]');
    } catch (e) { legacy = []; }
    if (!legacy || !legacy.length) return Promise.resolve();
    try {
      if (localStorage.getItem('mika_reviews_migrated') === '1') return Promise.resolve();
      if (state.reviews.length > 0) return Promise.resolve();
    } catch (e) { /* ignore */ }

    var c = ensureClient();
    var inserts = legacy.slice(0, 200).filter(function(r){
      return r && r.service && r.needs && r.content;
    }).map(function(r){
      return c.from(cfg.reviewsTable).insert({
        nickname: (r.nickname || '').toString().slice(0, 40),
        comment: (r.comment || '').toString().slice(0, 2000),
        service: Math.min(10, Math.max(1, r.service)),
        needs: Math.min(10, Math.max(1, r.needs)),
        content: Math.min(10, Math.max(1, r.content)),
        display_date: r.date || ''
      });
    });

    return Promise.all(inserts).then(function(results){
      var anyError = results.some(function(r){ return r && r.error; });
      if (anyError) throw new Error('Could not migrate previous reviews.');
      try { localStorage.setItem('mika_reviews_migrated', '1'); } catch (e) {}
      return loadReviews();
    });
  }

  function notifyWaiters(err){
    readyWaiters.forEach(function(fn){ try { fn(err); } catch (e) {} });
    readyWaiters = [];
  }

  // Run a load-fn inside a Promise so a synchronous throw (e.g. missing
  // Supabase client) becomes a rejection that Promise.allSettled can catch
  // and surface to onReady() waiters instead of escaping unhandled.
  function asPromise(fn){
    try {
      var r = fn();
      return r && typeof r.then === 'function' ? r : Promise.resolve(r);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // Kick off (or join) the initial load of likes + reviews.
  function loadIfNeeded(){
    if (state.loaded || state.loading) return Promise.resolve();
    state.loading = true;
    return Promise.allSettled([asPromise(loadVotes), asPromise(loadReviews)]).then(function(results){
      var err = null;
      results.forEach(function(r){
        if (r.status === 'rejected' && !err) err = r.reason;
      });
      state.loading = false;
      if (err) {
        state.loadError = err;
        state.loaded = true;
        notifyWaiters(err);
        return Promise.reject(err);
      }
      return migrateLegacyReviews().catch(function(){ /* best-effort */ })
        .then(function(){ return loadReviews(); })
        .then(function(){
          state.loaded = true;
          state.loadError = null;
          notifyWaiters(null);
          return true;
        })
        .catch(function(migErr){
          state.loaded = true;
          state.loadError = migErr;
          notifyWaiters(migErr);
          return Promise.reject(migErr);
        });
    });
  }

  // Register a callback that fires once the initial load resolves.
  // If already loaded, the callback fires immediately.
  function onReady(fn){
    if (state.loaded) { try { fn(state.loadError); } catch (e) {} return; }
    readyWaiters.push(fn);
    var p = loadIfNeeded();
    // loadIfNeeded() rejects to surface errors to direct callers, but here
    // waiters are already notified via notifyWaiters() -> swallow the
    // resulting unhandled rejection.
    if (p && p.catch) p.catch(function(){});
  }

  // Toggle the current visitor's vote on a photo. Returns a promise of the
  // updated { like, dislike } counts for that key.
  function toggleVote(recordKey, action){
    var c = ensureClient();
    var vid = getVoterId();
    return c.rpc(cfg.toggleVoteFunc, {
      p_record_key: recordKey,
      p_action: action,
      p_voter_id: vid
    }).then(function(res){
      if (res.error) throw res.error;
      // Refresh authoritative counts from the server.
      return loadVotes().then(function(){
        return state.counts[recordKey] || { like: 0, dislike: 0 };
      });
    });
  }

  // Insert a new review. Returns a promise of the inserted row.
  function addReview(data){
    var c = ensureClient();
    return c.from(cfg.reviewsTable).insert({
      nickname: (data.nickname || '').toString().slice(0, 40) || 'Anonymous',
      comment: (data.comment || '').toString().slice(0, 2000),
      service: Math.min(10, Math.max(1, data.service)),
      needs: Math.min(10, Math.max(1, data.needs)),
      content: Math.min(10, Math.max(1, data.content)),
      display_date: data.date || ''
    }).select('id,created_at,nickname,comment,service,needs,content,display_date').then(function(res){
      if (res.error) throw res.error;
      return loadReviews().then(function(){ return (res.data && res.data[0]) || null; });
    });
  }

  window.Persistence = {
    loadIfNeeded: loadIfNeeded,
    onReady: onReady,
    getVoterId: getVoterId,
    voteCountsFor: function(key){ return state.counts[key] || { like: 0, dislike: 0 }; },
    myAction: function(key){ return state.mine[key] || null; },
    isReady: function(){ return state.loaded; },
    getLoadError: function(){ return state.loadError; },
    getReviews: function(){ return state.reviews.slice(); },
    toggleVote: toggleVote,
    addReview: addReview,
    migrateLegacy: migrateLegacyReviews
  };
})();