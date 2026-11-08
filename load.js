/* 僧中词典 · 分片加载器
   本地双击打开时 file:// 不能 fetch，因此用 <script src> 依次挂载全局数据分片；
   分片清单由 build_data.ps1 自动生成到 data/manifest.js，无需手工维护。 */
(function () {
  'use strict';
  window.DICT_ROWS = window.DICT_ROWS || [];
  var bootText = document.getElementById('bootText');
  function say(t) { if (bootText) bootText.textContent = t; }

  var m = window.DICT_MANIFEST;
  if (!m || !m.shards || !m.shards.length) {
    say('未找到数据分片清单：请先运行 build_data.cmd，由 data/txt/dictionary.txt 生成分片。');
    return;
  }
  var list = m.shards, i = 0, failed = [];

  function loadScript(src, ok) {
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = ok;
    s.onerror = function () { failed.push(src); ok(); };
    document.head.appendChild(s);
  }

  function boot() {
    say('正在加载释义增强层…');
    loadScript('data/marks.js', function () {
      loadScript('data/extras.js', function () {
        loadScript('app.js', function () {});
      });
    });
  }

  function next() {
    if (i >= list.length) { say('正在建立索引…'); boot(); return; }
    var src = list[i++];
    say('正在加载数据分片 ' + i + ' / ' + list.length + '…');
    loadScript(src, next);
  }

  next();
  window.addEventListener('load', function () {
    if (failed.length) console.warn('[僧中词典] 以下分片加载失败：', failed);
  });
})();
