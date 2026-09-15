(function(){
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  document.addEventListener('dragstart', function(e){
    var t = e.target;
    if (t && (t.tagName === 'IMG' || t.tagName === 'A')) { e.preventDefault(); e.dataTransfer.effectAllowed = 'none'; }
  });
  document.addEventListener('copy', function(e){
    e.clipboardData.setData('text/plain', 'Copyright Mika Creator. Images are protected.');
    e.preventDefault();
  });
  var s = document.createElement('style');
  s.textContent = 'img{-webkit-user-drag:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation;pointer-events:auto}';
  document.head.appendChild(s);
})();