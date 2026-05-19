// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
const building = window.BUILDING;
let currentFloor = "floor1";
let currentFloorData = building.floors.floor1;

const startSelect = document.getElementById("startSelect");
const endSelect   = document.getElementById("endSelect");
const startSection = document.getElementById("startSection");
const endSection = document.getElementById("endSection");
const buildBtn    = document.getElementById("buildBtn");
const clearBtn    = document.getElementById("clearBtn");
const resultText  = document.getElementById("resultText");

const nodesLayer  = document.getElementById("nodesLayer");
const routePathEl = document.getElementById("routePath");
const navDotEl    = document.getElementById("navDot");

const floorUpBtn = document.getElementById('floorUpBtn');
const floorDownBtn = document.getElementById('floorDownBtn');

const customHint = document.getElementById('customHint');
const hintText = document.querySelector('.hint-text');

let startNode = null;
let endNode = null;
let fullGraph = null;
let currentRouteSegments = null;
let currentRoutePath = null;

// Переменные для управления многоэтажной анимацией
let isAnimating = false;
let currentSegmentIndex = 0;
let pendingFloorSwitch = null;
let animationStarted = false;

// Хранилище для финальных path элементов
let finalRoutePaths = [];

// ========== ПЕРЕМЕННЫЕ ДЛЯ ПОДСВЕТКИ КОРПУСОВ ==========
let activeHighlights = new Set();
let highlightPolygons = {};
let blinkEnabled = false;
let currentBlinkSpeed = 1;
let blinkInterval = null;

// Цвета корпусов
const corpusColors = {
  uk1: { stroke: "#4285f4", fill: "rgba(66, 133, 244, 0.25)" },
  uk3: { stroke: "#34a853", fill: "rgba(52, 168, 83, 0.25)" },
  uk4: { stroke: "#fbbc04", fill: "rgba(251, 188, 4, 0.25)" },
  uk5: { stroke: "#ea4335", fill: "rgba(234, 67, 53, 0.25)" },
  общежитие: { stroke: "#a142f4", fill: "rgba(161, 66, 244, 0.25)" }
};

// ========== ЗАПОЛНЕНИЕ СПИСКОВ КОРПУСОВ ==========
function fillSectionSelects() {
  const sections = Object.entries(building.sections);
  
  startSection.innerHTML = '';
  sections.forEach(([id, data]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = data.name;
    startSection.appendChild(option);
  });
  
  endSection.innerHTML = '';
  sections.forEach(([id, data]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = data.name;
    endSection.appendChild(option);
  });
}

// ========== ПРЕДЗАГРУЗКА ИЗОБРАЖЕНИЙ ==========
function preloadFloorImages() {
  console.log('Предзагрузка изображений этажей...');
  Object.values(building.floors).forEach(floor => {
    const img = new Image();
    img.src = floor.svg;
    img.onload = () => console.log(`✅ Загружен: ${floor.svg}`);
    img.onerror = () => console.warn(`❌ Ошибка загрузки: ${floor.svg}`);
  });
}

function ensureFirstFloorImage() {
  const svgImage = document.querySelector('#mapSvg image');
  if (svgImage) {
    const originalHref = svgImage.getAttribute('href');
    setTimeout(() => {
      svgImage.setAttribute('href', originalHref);
    }, 10);
  }
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function roomIdsSorted() {
  // Функция больше не используется для отрисовки, оставлена для совместимости
  return Object.entries(currentFloorData.nodes)
    .filter(([,n]) => n.type === "room")
    .map(([id]) => id)
    .sort((a,b) => a.localeCompare(b, "ru", {numeric:true}));
}

// ========== ЗАПОЛНЕНИЕ ВЫПАДАЮЩИХ СПИСКОВ (ВСЕ ЭТАЖИ) ==========
function fillRoomSelect(selectElement, sectionId) {
  selectElement.innerHTML = "";
  
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "";
  selectElement.appendChild(emptyOption);
  
  const allRooms = [];
  
  for (const [floorKey, floorData] of Object.entries(building.floors)) {
    const roomsOnFloor = Object.entries(floorData.nodes)
      .filter(([, node]) => node.type === "room" && node.section === sectionId)
      .map(([nodeId, nodeData]) => ({
        id: nodeId,
        label: nodeData.label,
        floor: floorKey,
        floorName: floorData.name
      }));
    
    allRooms.push(...roomsOnFloor);
  }
  
  allRooms.sort((a, b) => {
    const numA = parseInt(a.label) || 0;
    const numB = parseInt(b.label) || 0;
    return numA - numB;
  });
  
  allRooms.forEach(room => {
    const option = document.createElement("option");
    option.value = room.id;
    option.setAttribute("data-floor", room.floor);
    option.textContent = `${room.label} (${room.floorName})`;
    selectElement.appendChild(option);
  });
}

function updateAllSelects() {
  if (startSection.value) {
    fillRoomSelect(startSelect, startSection.value);
  }
  if (endSection.value) {
    fillRoomSelect(endSelect, endSection.value);
  }
}

// ========== УПРАВЛЕНИЕ ВЫБОРОМ ТОЧЕК ==========
function setStart(sectionId, floorId, nodeId) {
  startNode = { section: sectionId, floor: floorId, node: nodeId };
  startSection.value = sectionId;
  
  for (const option of startSelect.options) {
    if (option.value === nodeId && option.getAttribute('data-floor') === floorId) {
      startSelect.value = option.value;
      break;
    }
  }
  
  // updatePins() – отключено, так как точки не рисуются
}

function setEnd(sectionId, floorId, nodeId) {
  endNode = { section: sectionId, floor: floorId, node: nodeId };
  endSection.value = sectionId;
  
  for (const option of endSelect.options) {
    if (option.value === nodeId && option.getAttribute('data-floor') === floorId) {
      endSelect.value = option.value;
      break;
    }
  }
  
  // updatePins() – отключено
}

function updatePins() {
  // Функция оставлена для совместимости, но ничего не делает
}

// ========== ПОСТРОЕНИЕ ПОЛНОГО ГРАФА ==========
function buildFullGraph() {
  const graph = {};
  
  for (const [floorId, floor] of Object.entries(building.floors)) {
    for (const [nodeId, nodeData] of Object.entries(floor.nodes)) {
      const fullId = `${floorId}_${nodeId}`;
      graph[fullId] = {
        ...nodeData,
        floor: floorId,
        originalId: nodeId,
        section: nodeData.section,
        edges: {}
      };
    }
  }
  
  for (const [floorId, floor] of Object.entries(building.floors)) {
    for (const edge of floor.edges) {
      const [a, b, w] = edge;
      const fromId = `${floorId}_${a}`;
      const toId = `${floorId}_${b}`;
      
      if (!graph[fromId] || !graph[toId]) continue;
      
      const weight = w || Math.max(1, Math.round(
        (Math.abs(floor.nodes[a].x - floor.nodes[b].x) + 
         Math.abs(floor.nodes[a].y - floor.nodes[b].y)) / 40
      ));
      
      graph[fromId].edges[toId] = weight;
      graph[toId].edges[fromId] = weight;
    }
  }
  
  if (building.interfloorConnections) {
    for (const conn of building.interfloorConnections) {
      const fromId = `${conn.from.floor}_${conn.from.node}`;
      const toId = `${conn.to.floor}_${conn.to.node}`;
      
      if (graph[fromId] && graph[toId]) {
        const weight = conn.weight || 3;
        graph[fromId].edges[toId] = weight;
        graph[toId].edges[fromId] = weight;
      }
    }
  }
  
  return graph;
}

// ========== МНОГОЭТАЖНЫЙ АЛГОРИТМ ДЕЙКСТРЫ ==========
function findMultiFloorPath(startFullId, endFullId) {
  const dist = {};
  const prev = {};
  const visited = new Set();
  
  for (const id of Object.keys(fullGraph)) {
    dist[id] = Infinity;
    prev[id] = null;
  }
  dist[startFullId] = 0;
  
  while (true) {
    let u = null;
    let best = Infinity;
    for (const id of Object.keys(dist)) {
      if (!visited.has(id) && dist[id] < best) {
        best = dist[id];
        u = id;
      }
    }
    if (u === null) break;
    if (u === endFullId) break;
    visited.add(u);
    
    if (!fullGraph[u].edges) continue;
    for (const [v, w] of Object.entries(fullGraph[u].edges)) {
      const alt = dist[u] + w;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }
  
  if (!isFinite(dist[endFullId])) return null;
  
  const path = [];
  for (let cur = endFullId; cur; cur = prev[cur]) {
    path.unshift(cur);
  }
  
  return { path, cost: dist[endFullId] };
}

// ========== РАЗБИЕНИЕ ПУТИ ПО ЭТАЖАМ ==========
function splitPathByFloors(path) {
  const segments = [];
  let currentFloorId = null;
  let currentSegment = [];
  
  for (const fullId of path) {
    const underscoreIndex = fullId.indexOf('_');
    const floorId = fullId.substring(0, underscoreIndex);
    
    if (floorId !== currentFloorId) {
      if (currentSegment.length > 0) {
        segments.push({
          floor: currentFloorId,
          nodes: [...currentSegment]
        });
      }
      currentFloorId = floorId;
      currentSegment = [fullId];
    } else {
      currentSegment.push(fullId);
    }
  }
  
  if (currentSegment.length > 0) {
    segments.push({
      floor: currentFloorId,
      nodes: currentSegment
    });
  }
  
  return segments;
}

// ========== ПРЕОБРАЗОВАНИЕ ПУТИ В SVG ==========
function pathToSvgD(pathNodes) {
  if (pathNodes.length === 0) return "";
  
  const pts = [];
  for (const fullId of pathNodes) {
    const underscoreIndex = fullId.indexOf('_');
    const floorId = fullId.substring(0, underscoreIndex);
    const nodeId = fullId.substring(underscoreIndex + 1);
    
    const node = building.floors[floorId]?.nodes[nodeId];
    if (node) {
      pts.push([node.x, node.y]);
    }
  }
  
  if (pts.length === 0) return "";
  
  const [x0, y0] = pts[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    d += ` L ${x} ${y}`;
  }
  return d;
}

// ========== ОТОБРАЖЕНИЕ ТЕКУЩЕГО СЕГМЕНТА ==========
function displaySegment(segment) {
  if (!segment) return;
  const pathData = pathToSvgD(segment.nodes);
  routePathEl.setAttribute("d", pathData);
}

// ========== ОЧИСТКА ФИНАЛЬНЫХ ПУТЕЙ ==========
function clearFinalRoutes() {
  finalRoutePaths.forEach(path => path.remove());
  finalRoutePaths = [];
}

// ========== ФИНАЛЬНЫЙ ПОКАЗ МАРШРУТА ==========
function showFinalRouteSeparate() {
  if (!currentRouteSegments) return;
  
  clearFinalRoutes();
  
  const segmentsOnFloor = currentRouteSegments.filter(seg => seg.floor === currentFloor);
  
  if (segmentsOnFloor.length === 0) {
    routePathEl.setAttribute("d", "");
    navDotEl.setAttribute("cx", -100);
    navDotEl.setAttribute("cy", -100);
    return;
  }
  
  for (let i = 0; i < segmentsOnFloor.length; i++) {
    const segmentD = pathToSvgD(segmentsOnFloor[i].nodes);
    if (segmentD) {
      const newPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      newPath.setAttribute("d", segmentD);
      newPath.setAttribute("class", "route");
      newPath.style.fill = "none";
      newPath.style.stroke = "var(--accent)";
      newPath.style.strokeWidth = "var(--stroke)";
      newPath.style.strokeLinecap = "round";
      newPath.style.strokeLinejoin = "round";
      
      document.getElementById("routeLayer").appendChild(newPath);
      finalRoutePaths.push(newPath);
    }
  }
  
  routePathEl.setAttribute("d", "");
  
  const lastSegment = segmentsOnFloor[segmentsOnFloor.length - 1];
  if (lastSegment.nodes.length > 0) {
    const lastNode = lastSegment.nodes[lastSegment.nodes.length - 1];
    const underscoreIndex = lastNode.indexOf('_');
    const floorId = lastNode.substring(0, underscoreIndex);
    const nodeId = lastNode.substring(underscoreIndex + 1);
    const node = building.floors[floorId]?.nodes[nodeId];
    if (node) {
      navDotEl.setAttribute("cx", node.x);
      navDotEl.setAttribute("cy", node.y);
    }
  }
}

// ========== УПРАВЛЕНИЕ ПОДСКАЗКАМИ ==========
function showCustomHint(message) {
  hintText.textContent = message;
  customHint.classList.remove('hidden');
}

function hideCustomHint() {
  customHint.classList.add('hidden');
}

function showFloorHint(direction) {
  stopFloorHint();
  
  if (direction === 'up') {
    floorUpBtn.classList.add('hint-up');
    showCustomHint('Нажмите кнопку ▲ чтобы перейти на следующий этаж');
  } else if (direction === 'down') {
    floorDownBtn.classList.add('hint-down');
    showCustomHint('Нажмите кнопку ▼ чтобы перейти на предыдущий этаж');
  }
}

function stopFloorHint() {
  floorUpBtn.classList.remove('hint-up');
  floorDownBtn.classList.remove('hint-down');
  hideCustomHint();
}

// ========== ПЕРЕКЛЮЧЕНИЕ ЭТАЖЕЙ ==========
function goToFloorUp() {
  const floors = Object.keys(building.floors);
  const currentIndex = floors.indexOf(currentFloor);
  
  if (currentIndex < floors.length - 1) {
    switchFloor(floors[currentIndex + 1]);
  }
}

function goToFloorDown() {
  const floors = Object.keys(building.floors);
  const currentIndex = floors.indexOf(currentFloor);
  
  if (currentIndex > 0) {
    switchFloor(floors[currentIndex - 1]);
  }
}

function updateFloorButtonsState() {
  const floors = Object.keys(building.floors);
  const currentIndex = floors.indexOf(currentFloor);
  
  floorUpBtn.disabled = currentIndex >= floors.length - 1;
  floorDownBtn.disabled = currentIndex <= 0;
}

// ========== АНИМАЦИЯ МАРШРУТА ==========
function animateRoute(segmentDuration = 900, callback) {
  const pathEl = routePathEl;
  const len = pathEl.getTotalLength();
  
  if (len <= 0) {
    if (callback) callback();
    return;
  }

  pathEl.getBoundingClientRect();
  
  pathEl.style.transition = "none";
  pathEl.style.strokeDasharray = `${len}`;
  pathEl.style.strokeDashoffset = `${len}`;
  pathEl.offsetHeight;
  
  setTimeout(() => {
    pathEl.style.transition = `stroke-dashoffset ${segmentDuration}ms ease`;
    pathEl.style.strokeDashoffset = "0";
  }, 10);

  const dotDuration = segmentDuration + 200;
  const t0 = performance.now();
  const endPoint = pathEl.getPointAtLength(len);
  navDotEl.setAttribute("cx", -100);
  navDotEl.setAttribute("cy", -100);

  function step(now) {
    const t = Math.min(1, (now - t0) / dotDuration);
    const p = pathEl.getPointAtLength(len * t);
    navDotEl.setAttribute("cx", p.x);
    navDotEl.setAttribute("cy", p.y);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      navDotEl.setAttribute("cx", endPoint.x);
      navDotEl.setAttribute("cy", endPoint.y);
      if (callback) callback();
    }
  }
  requestAnimationFrame(step);
}

// ========== МНОГОЭТАЖНАЯ АНИМАЦИЯ ==========
function startMultiFloorAnimation() {
  if (!currentRouteSegments || currentRouteSegments.length === 0) return;
  if (animationStarted) return;
  
  console.log('🚀 Запуск многоэтажной анимации');
  
  isAnimating = true;
  currentSegmentIndex = 0;
  pendingFloorSwitch = null;
  stopFloorHint();
  animationStarted = true;
  
  clearFinalRoutes();
  routePathEl.setAttribute("d", "");
  navDotEl.setAttribute("cx", -100);
  navDotEl.setAttribute("cy", -100);
  
  playCurrentSegment();
}

function playCurrentSegment() {
  if (!isAnimating) return;
  
  if (currentSegmentIndex >= currentRouteSegments.length) {
    console.log('🏁 Анимация завершена');
    isAnimating = false;
    showFinalRouteSeparate();
    return;
  }
  
  const segment = currentRouteSegments[currentSegmentIndex];
  
  if (currentFloor !== segment.floor) {
    pendingFloorSwitch = segment.floor;
    const floors = Object.keys(building.floors);
    const currentIdx = floors.indexOf(currentFloor);
    const targetIdx = floors.indexOf(segment.floor);
    
    if (targetIdx > currentIdx) {
      showFloorHint('up');
    } else {
      showFloorHint('down');
    }
    return;
  }
  
  pendingFloorSwitch = null;
  stopFloorHint();
  
  displaySegment(segment);
  
  const len = routePathEl.getTotalLength();
  if (len > 0) {
    routePathEl.style.transition = "none";
    routePathEl.style.strokeDasharray = `${len}`;
    routePathEl.style.strokeDashoffset = `${len}`;
    routePathEl.offsetHeight;
    
    animateRoute(900, () => {
      currentSegmentIndex++;
      playCurrentSegment();
    });
  } else {
    currentSegmentIndex++;
    playCurrentSegment();
  }
}

// ========== ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА (только комнаты и лестницы, без коридоров) ==========
function showMultiFloorResult(segments, cost) {
  let html = '<div class="route-instructions">';
  
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const floorName = building.floors[seg.floor]?.name || seg.floor;
    
    const steps = [];
    for (const fullId of seg.nodes) {
      const underscoreIndex = fullId.indexOf('_');
      const floorId = fullId.substring(0, underscoreIndex);
      const nodeId = fullId.substring(underscoreIndex + 1);
      const node = building.floors[floorId]?.nodes[nodeId];
      if (!node) continue;
      if (node.type === 'corridor') continue;
      
      let label = node.label || nodeId;
      let icon = '';
      if (node.type === 'stairs') icon = '<i class="fas fa-stairs" style="margin-right: 4px;"></i>';
      else if (node.type === 'room') icon = '<i class="fas fa-door-open" style="margin-right: 4px;"></i>';
      else icon = '<i class="fas fa-arrow-right" style="margin-right: 4px;"></i>';
      
      steps.push(`${icon}${label}`);
    }
    
    if (steps.length === 0) continue;
    
    const pathStr = steps.join(' → ');
    
    html += `<div class="route-step">`;
    html += `  <div class="step-floor">🏢 ${floorName}</div>`;
    html += `  <div class="step-path-full">${pathStr}</div>`;
    if (idx < segments.length - 1) {
      const nextFloor = building.floors[segments[idx + 1].floor]?.name || segments[idx + 1].floor;
      html += `  <div class="step-change">⬇️ Переход на ${nextFloor}</div>`;
    }
    html += `</div>`;
  }
  
  html += '</div>';
  resultText.innerHTML = html;
}

// ========== ПОСТРОЕНИЕ МАРШРУТА ==========
function buildRoute() {
  if (!startNode || !endNode) {
    resultText.textContent = "Сначала выбери Старт и Финиш.";
    return;
  }
  
  const startFullId = `${startNode.floor}_${startNode.node}`;
  const endFullId = `${endNode.floor}_${endNode.node}`;
  
  console.log('Поиск пути от', startFullId, 'до', endFullId);
  
  if (!fullGraph) {
    fullGraph = buildFullGraph();
  }
  
  const result = findMultiFloorPath(startFullId, endFullId);
  
  if (!result) {
    resultText.textContent = "Маршрут не найден! Проверь связи между корпусами.";
    return;
  }
  
  currentRoutePath = result.path;
  currentRouteSegments = splitPathByFloors(result.path);
  
  showMultiFloorResult(currentRouteSegments, result.cost);
  
  if (isAnimating) {
    isAnimating = false;
  }
  stopFloorHint();
  
  clearFinalRoutes();
  routePathEl.setAttribute("d", "");
  navDotEl.setAttribute("cx", -100);
  navDotEl.setAttribute("cy", -100);
  
  currentSegmentIndex = 0;
  pendingFloorSwitch = null;
  animationStarted = false;
  
  if (currentFloor !== startNode.floor) {
    switchFloor(startNode.floor);
  } else {
    startMultiFloorAnimation();
  }
}

// ========== СБРОС МАРШРУТА ==========
function clearRoute() {
  startNode = null;
  endNode = null;
  currentRouteSegments = null;
  currentRoutePath = null;
  isAnimating = false;
  currentSegmentIndex = 0;
  pendingFloorSwitch = null;
  animationStarted = false;
  
  clearFinalRoutes();
  stopFloorHint();
  
  startSelect.value = "";
  endSelect.value = "";
  routePathEl.setAttribute("d", "");
  navDotEl.setAttribute("cx", -100);
  navDotEl.setAttribute("cy", -100);
  resultText.textContent = "Выбери старт и финиш.";
}

// ========== ПЕРЕКЛЮЧЕНИЕ ЭТАЖА ==========
function switchFloor(floorId) {
  const oldFloor = currentFloor;
  currentFloor = floorId;
  currentFloorData = building.floors[floorId];
  
  const svgImage = document.querySelector('#mapSvg image');
  if (svgImage) {
    svgImage.setAttribute('href', currentFloorData.svg);
  }
  
  // Кликабельные узлы больше не рисуются
  // renderClickableNodes();
  
  document.querySelectorAll('.floor-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.floor === floorId);
  });
  
  updateFloorButtonsState();
  
  // Обновляем подсветку корпусов при смене этажа
  updateHighlights();
  
  if (isAnimating && pendingFloorSwitch === floorId) {
    pendingFloorSwitch = null;
    stopFloorHint();
    playCurrentSegment();
  }
  else if (currentRouteSegments && !animationStarted && floorId === startNode?.floor) {
    startMultiFloorAnimation();
  }
  else if (currentRouteSegments && !isAnimating && animationStarted) {
    showFinalRouteSeparate();
  }
}

// ========== ОТРИСОВКА КЛИКАБЕЛЬНЫХ УЗЛОВ ОТКЛЮЧЕНА ==========
function renderClickableNodes() {
  // Функция ничего не делает – узлы на карте не отображаются,
  // маршрут строится только через выпадающие списки.
  // nodesLayer.innerHTML = "";  // очистка не требуется
}

// ========== ПОДСВЕТКА КОРПУСОВ (ПОЛИГОНЫ) ==========

// Удалить все подсветки
function clearAllHighlights() {
  Object.values(highlightPolygons).forEach(polygon => {
    if (polygon && polygon.remove) polygon.remove();
  });
  highlightPolygons = {};
}

// Подсветить конкретный корпус
function highlightCorpus(corpusId, isActive) {
  const polygonsData = building.corpusPolygons?.[currentFloor]?.[corpusId];
  if (!polygonsData || polygonsData.length === 0) return;
  
  const key = `${currentFloor}_${corpusId}`;
  
  if (isActive) {
    if (highlightPolygons[key]) return;
    
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    const points = polygonsData.map(p => `${p.x},${p.y}`).join(' ');
    polygon.setAttribute("points", points);
    polygon.setAttribute("fill", corpusColors[corpusId]?.fill || "rgba(255,255,255,0.2)");
    polygon.setAttribute("stroke", corpusColors[corpusId]?.stroke || "#ffffff");
    polygon.setAttribute("stroke-width", "2");
    polygon.setAttribute("stroke-opacity", "0.8");
    polygon.setAttribute("class", "corpus-highlight-polygon");
    polygon.setAttribute("data-corpus", corpusId);
    polygon.setAttribute("pointer-events", "none");
    
    if (blinkEnabled) {
      polygon.style.animation = `blink-polygon ${1/currentBlinkSpeed}s ease-in-out infinite`;
    }
    
    const mapSvg = document.getElementById('mapSvg');
    const nodesLayerElem = document.getElementById('nodesLayer');
    mapSvg.insertBefore(polygon, nodesLayerElem);
    
    highlightPolygons[key] = polygon;
  } else {
    if (highlightPolygons[key]) {
      highlightPolygons[key].remove();
      delete highlightPolygons[key];
    }
  }
}

// Обновить все подсветки
function updateHighlights() {
  clearAllHighlights();
  
  activeHighlights.forEach(corpusId => {
    highlightCorpus(corpusId, true);
  });
}

// Обновить скорость мигания
function updateBlinkSpeed() {
  const speed = currentBlinkSpeed;
  Object.values(highlightPolygons).forEach(polygon => {
    if (blinkEnabled) {
      polygon.style.animation = `blink-polygon ${1/speed}s ease-in-out infinite`;
    } else {
      polygon.style.animation = '';
    }
  });
}

// Инициализация панели подсветки
function initCorpusHighlighting() {
  const checkboxes = document.querySelectorAll('.corpus-checkbox input');
  const clearAllBtn = document.getElementById('clearAllHighlight');
  const blinkModeCheckbox = document.getElementById('blinkMode');
  const blinkSpeedSlider = document.getElementById('blinkSpeed');
  const speedValueSpan = document.getElementById('speedValue');
  
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const corpusId = e.target.value;
      if (e.target.checked) {
        activeHighlights.add(corpusId);
      } else {
        activeHighlights.delete(corpusId);
      }
      updateHighlights();
    });
  });
  
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      checkboxes.forEach(cb => cb.checked = false);
      activeHighlights.clear();
      updateHighlights();
    });
  }
  
  if (blinkModeCheckbox) {
    blinkModeCheckbox.addEventListener('change', (e) => {
      blinkEnabled = e.target.checked;
      Object.values(highlightPolygons).forEach(polygon => {
        if (blinkEnabled) {
          polygon.style.animation = `blink-polygon ${1/currentBlinkSpeed}s ease-in-out infinite`;
        } else {
          polygon.style.animation = '';
        }
      });
    });
  }
  
  if (blinkSpeedSlider && speedValueSpan) {
    blinkSpeedSlider.addEventListener('input', (e) => {
      currentBlinkSpeed = parseFloat(e.target.value);
      speedValueSpan.textContent = `${currentBlinkSpeed.toFixed(1)}x`;
      updateBlinkSpeed();
    });
  }
}

// ========== СОБЫТИЯ UI ==========
buildBtn.addEventListener("click", buildRoute);
clearBtn.addEventListener("click", clearRoute);

startSection.addEventListener("change", () => {
  updateAllSelects();
  startNode = null;
});

endSection.addEventListener("change", () => {
  updateAllSelects();
  endNode = null;
});

startSelect.addEventListener("change", () => {
  if (startSelect.value) {
    const selectedOption = startSelect.selectedOptions[0];
    const floorId = selectedOption.getAttribute('data-floor');
    setStart(startSection.value, floorId, startSelect.value);
  } else {
    startNode = null;
  }
});

endSelect.addEventListener("change", () => {
  if (endSelect.value) {
    const selectedOption = endSelect.selectedOptions[0];
    const floorId = selectedOption.getAttribute('data-floor');
    setEnd(endSection.value, floorId, endSelect.value);
  } else {
    endNode = null;
  }
});

document.querySelectorAll('.floor-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchFloor(btn.dataset.floor);
  });
});

floorUpBtn.addEventListener('click', goToFloorUp);
floorDownBtn.addEventListener('click', goToFloorDown);

// ========== ИНИЦИАЛИЗАЦИЯ ==========
fillSectionSelects();
updateAllSelects();
resultText.textContent = "Выбери старт и финиш.";
fullGraph = buildFullGraph();
updateFloorButtonsState();
preloadFloorImages();
ensureFirstFloorImage();
initCorpusHighlighting();

// Фикс скролла выпадающих списков
document.querySelectorAll('.room-select, .section-select').forEach(select => {
  select.addEventListener('wheel', (e) => {
    e.stopPropagation();
  });
});

// Блокировка прокрутки страницы при фокусе на выпадающих списках
const selectElements = document.querySelectorAll('.room-select, .section-select');
let scrollTopPosition = 0;

function preventScrollOnFocus() {
  scrollTopPosition = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollTopPosition}px`;
  document.body.style.width = '100%';
}

function restoreScrollOnBlur() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, scrollTopPosition);
}

selectElements.forEach(select => {
  select.addEventListener('focus', preventScrollOnFocus);
  select.addEventListener('blur', restoreScrollOnBlur);
  select.addEventListener('change', restoreScrollOnBlur);
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      restoreScrollOnBlur();
    }
  });
});

window.addEventListener('click', (e) => {
  if (!e.target.closest('.room-select') && !e.target.closest('.section-select')) {
    if (document.body.style.position === 'fixed') {
      restoreScrollOnBlur();
    }
  }
});

// ========== ПЛАВНОЕ МАСШТАБИРОВАНИЕ И ПЕРЕМЕЩЕНИЕ ==========
let currentScale = 1;
const zoomStep = 0.3;
const minScale = 1;
const maxScale = 15;

let targetViewBox = { x: 0, y: 0, width: 1562, height: 749 };
let currentViewBox = { x: 0, y: 0, width: 1562, height: 749 };
let animationFrame = null;
let isPanningAnimation = false;

const svg = document.getElementById('mapSvg');

function getViewBox() {
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  return { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
}

function setViewBox(x, y, width, height) {
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
}

function animateViewBox() {
  if (!isPanningAnimation) return;
  
  const speed = 0.15;
  
  currentViewBox.x += (targetViewBox.x - currentViewBox.x) * speed;
  currentViewBox.y += (targetViewBox.y - currentViewBox.y) * speed;
  currentViewBox.width += (targetViewBox.width - currentViewBox.width) * speed;
  currentViewBox.height += (targetViewBox.height - currentViewBox.height) * speed;
  
  setViewBox(
    currentViewBox.x,
    currentViewBox.y,
    currentViewBox.width,
    currentViewBox.height
  );
  
  const dx = Math.abs(targetViewBox.x - currentViewBox.x);
  const dy = Math.abs(targetViewBox.y - currentViewBox.y);
  const dw = Math.abs(targetViewBox.width - currentViewBox.width);
  
  if (dx > 0.5 || dy > 0.5 || dw > 0.5) {
    animationFrame = requestAnimationFrame(animateViewBox);
  } else {
    setViewBox(
      targetViewBox.x,
      targetViewBox.y,
      targetViewBox.width,
      targetViewBox.height
    );
    currentViewBox = { ...targetViewBox };
    isPanningAnimation = false;
    animationFrame = null;
  }
}

function startPanAnimation() {
  if (!isPanningAnimation) {
    isPanningAnimation = true;
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    animationFrame = requestAnimationFrame(animateViewBox);
  }
}

function zoomIn() {
  if (currentScale < maxScale) {
    currentScale = Math.min(currentScale + zoomStep, maxScale);
    updateTargetViewBox();
  }
}

function zoomOut() {
  if (currentScale > minScale) {
    currentScale = Math.max(currentScale - zoomStep, minScale);
    updateTargetViewBox();
  }
}

function resetZoom() {
  currentScale = 1;
  updateTargetViewBox();
}

function updateTargetViewBox() {
  const centerX = currentViewBox.x + currentViewBox.width / 2;
  const centerY = currentViewBox.y + currentViewBox.height / 2;
  
  targetViewBox.width = 1562 / currentScale;
  targetViewBox.height = 749 / currentScale;
  
  targetViewBox.x = centerX - targetViewBox.width / 2;
  targetViewBox.y = centerY - targetViewBox.height / 2;
  
  startPanAnimation();
}

targetViewBox = getViewBox();
currentViewBox = { ...targetViewBox };

let isPanningActive = false;
let panStartX = 0;
let panStartY = 0;
let panStartViewBox = { x: 0, y: 0, width: 1562, height: 749 };

svg.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isPanningActive = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartViewBox = { ...currentViewBox };
    svg.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

svg.addEventListener('mousemove', (e) => {
  if (!isPanningActive) return;
  
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  
  const scaleX = panStartViewBox.width / svg.clientWidth;
  const scaleY = panStartViewBox.height / svg.clientHeight;
  
  targetViewBox.x = panStartViewBox.x - dx * scaleX;
  targetViewBox.y = panStartViewBox.y - dy * scaleY;
  
  startPanAnimation();
});

window.addEventListener('mouseup', () => {
  if (isPanningActive) {
    isPanningActive = false;
    svg.style.cursor = 'default';
    currentViewBox = { ...targetViewBox };
  }
});

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  
  const rect = svg.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const viewBoxX = currentViewBox.x + (mouseX / svg.clientWidth) * currentViewBox.width;
  const viewBoxY = currentViewBox.y + (mouseY / svg.clientHeight) * currentViewBox.height;
  
  if (e.deltaY < 0) {
    currentScale = Math.min(currentScale + zoomStep, maxScale);
  } else {
    currentScale = Math.max(currentScale - zoomStep, minScale);
  }
  
  targetViewBox.width = 1562 / currentScale;
  targetViewBox.height = 749 / currentScale;
  
  targetViewBox.x = viewBoxX - (mouseX / svg.clientWidth) * targetViewBox.width;
  targetViewBox.y = viewBoxY - (mouseY / svg.clientHeight) * targetViewBox.height;
  
  startPanAnimation();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
  }
});