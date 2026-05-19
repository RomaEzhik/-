/**
 * touch_nav.js — тач-управление картой для nav.html
 * Подключить ПОСЛЕ app.js:  <script src="touch_nav.js"></script>
 *
 * Добавляет:
 *  - drag одним пальцем (pan)
 *  - pinch двумя пальцами (zoom)
 *  - двойной тап — приближение к точке тапа
 */

(function () {
  const svg = document.getElementById('mapSvg');
  if (!svg) return;

  // ── Вспомогалки для работы с viewBox ──────────────────────────────────────
  function getVB() {
    const v = svg.getAttribute('viewBox').split(' ').map(Number);
    return { x: v[0], y: v[1], w: v[2], h: v[3] };
  }

  function setVB(vb) {
    // Ограничиваем масштаб — берём те же константы что в app.js
    const MIN_W = 1562 / 8;  // maxScale = 8
    const MAX_W = 1562 / 0.5; // minScale = 0.5
    vb.w = Math.min(Math.max(vb.w, MIN_W), MAX_W);
    vb.h = Math.min(Math.max(vb.h, MIN_W * (749 / 1562)), MAX_W * (749 / 1562));
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    // Синхронизируем currentScale из app.js если он доступен
    if (typeof currentViewBox !== 'undefined') {
      currentViewBox.x = vb.x;
      currentViewBox.y = vb.y;
      currentViewBox.width = vb.w;
      currentViewBox.height = vb.h;
    }
    if (typeof targetViewBox !== 'undefined') {
      targetViewBox.x = vb.x;
      targetViewBox.y = vb.y;
      targetViewBox.width = vb.w;
      targetViewBox.height = vb.h;
    }
    if (typeof currentScale !== 'undefined') {
      currentScale = 1562 / vb.w;
    }
  }

  // Координата тача в системе SVG viewBox
  function touchToSVG(touch, vb) {
    const rect = svg.getBoundingClientRect();
    const rx = (touch.clientX - rect.left) / rect.width;
    const ry = (touch.clientY - rect.top) / rect.height;
    return { x: vb.x + rx * vb.w, y: vb.y + ry * vb.h };
  }

  function midpoint(t1, t2) {
    return {
      clientX: (t1.clientX + t2.clientX) / 2,
      clientY: (t1.clientY + t2.clientY) / 2,
    };
  }

  function dist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Состояние ──────────────────────────────────────────────────────────────
  let touches = [];
  let startVB = null;
  let startPinchDist = 0;
  let startPinchMid = null;
  let startPinchVBMid = null;

  // Для двойного тапа
  let lastTapTime = 0;
  let lastTapPos = null;

  // ── Handlers ───────────────────────────────────────────────────────────────
  svg.addEventListener('touchstart', (e) => {
    e.preventDefault(); // блокируем нативный скролл страницы на карте
    touches = Array.from(e.touches);
    startVB = getVB();

    if (touches.length === 1) {
      // Двойной тап
      const now = Date.now();
      const t = touches[0];
      if (
        now - lastTapTime < 300 &&
        lastTapPos &&
        Math.abs(t.clientX - lastTapPos.x) < 20 &&
        Math.abs(t.clientY - lastTapPos.y) < 20
      ) {
        // Приближаем в 2x к точке тапа
        const vb = getVB();
        const svgPt = touchToSVG(t, vb);
        const newW = vb.w / 2;
        const newH = vb.h / 2;
        setVB({
          x: svgPt.x - newW / 2,
          y: svgPt.y - newH / 2,
          w: newW,
          h: newH,
        });
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;
      lastTapPos = { x: t.clientX, y: t.clientY };
    }

    if (touches.length === 2) {
      startPinchDist = dist(touches[0], touches[1]);
      startPinchMid = midpoint(touches[0], touches[1]);
      startPinchVBMid = touchToSVG(startPinchMid, startVB);
    }
  }, { passive: false });

  svg.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const cur = Array.from(e.touches);

    if (cur.length === 1 && startVB) {
      // Pan
      const t = cur[0];
      const rect = svg.getBoundingClientRect();
      const dx = (t.clientX - touches[0].clientX) / rect.width * startVB.w;
      const dy = (t.clientY - touches[0].clientY) / rect.height * startVB.h;
      setVB({
        x: startVB.x - dx,
        y: startVB.y - dy,
        w: startVB.w,
        h: startVB.h,
      });
    }

    if (cur.length === 2 && startVB && startPinchMid && startPinchVBMid) {
      // Pinch-zoom + pan одновременно
      const newDist = dist(cur[0], cur[1]);
      const scale = startPinchDist / newDist; // < 1 = приближение

      const newMid = midpoint(cur[0], cur[1]);
      const rect = svg.getBoundingClientRect();
      const panDX = (newMid.clientX - startPinchMid.clientX) / rect.width * startVB.w;
      const panDY = (newMid.clientY - startPinchMid.clientY) / rect.height * startVB.h;

      const newW = startVB.w * scale;
      const newH = startVB.h * scale;

      // Держим точку пинча неподвижной
      const midRX = (newMid.clientX - rect.left) / rect.width;
      const midRY = (newMid.clientY - rect.top) / rect.height;

      setVB({
        x: startPinchVBMid.x - panDX / scale - midRX * newW,
        y: startPinchVBMid.y - panDY / scale - midRY * newH,
        w: newW,
        h: newH,
      });
    }
  }, { passive: false });

  svg.addEventListener('touchend', (e) => {
    touches = Array.from(e.touches);
    if (touches.length < 2) {
      // Сбрасываем пинч, но сохраняем текущее состояние для следующего pan
      startVB = getVB();
      startPinchDist = 0;
      startPinchMid = null;
      startPinchVBMid = null;
      if (touches.length === 1) {
        // Перезапускаем pan от текущей точки
        startVB = getVB();
      }
    }
  }, { passive: false });

})();
