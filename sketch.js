let vp = null;
let points = [];
let lines = [];
let pointName = "";
let inputBuffer = "";
let currentLine = null;
let snapThreshold = 12;
let stage = 0;
let lockDirection = null;
let autoPointIndex = 0;
let eraserMode = false;
let undoStack = [];
let showLabels = true;
let isTrimMode = false;
let commandTargetPoint = null;

let panX = 0, panY = 0, scaleFactor = 1, isDragging = false, dragStart = null;
let lockModes = ['free', 'vertical', 'horizontal'];
let lockModeIndex = 0;

const shortcutKeys = ['i','l','k','e','t','x','/','r'];

function setup() {
  createCanvas(windowWidth, windowHeight);
  textSize(11);
  textAlign(LEFT);
}

function draw() {
  background(255);
  push();
  translate(panX, panY);
  scale(scaleFactor);

  if (vp) drawPoint(vp, 'VP');
  for (let p of points) drawNamedPoint(p);
  stroke(0);
  for (let l of lines) {
    line(l.x1, l.y1, l.x2, l.y2);
    if (showLabels) drawLineLabel(l);
  }

  if (currentLine) {
    stroke(150);
    let end = getSnappedPoint((mouseX - panX)/scaleFactor, (mouseY - panY)/scaleFactor);
    if (lockDirection === 'vertical') end.x = currentLine.x1;
    if (lockDirection === 'horizontal') end.y = currentLine.y1;
    line(currentLine.x1, currentLine.y1, end.x, end.y);
  }

  pop();

  fill(0);
  noStroke();
  if (showLabels) {
    text("Name: " + pointName + " | Length: " + inputBuffer +
         " | Eraser: " + (eraserMode ? "ON" : "OFF") +
         " | Trim: " + (isTrimMode ? "ON" : "OFF") +
         " | Reset: Delete", 10, height - 40);
  }

  drawSingleLockButton();
}
function drawSingleLockButton() {
  push();
  let x = width - 60;
  let y = height - 60;
  let size = 40;
  fill('#eeeeee');
  stroke(0);
  rect(x, y, size, size, 8);
  fill(0);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(20);
  text(getLockIcon(lockModes[lockModeIndex]), x + size / 2, y + size / 2);
  pop();
}

function getLockIcon(mode) {
  switch (mode) {
    case 'free': return '/';
    case 'vertical': return '↑↓';
    case 'horizontal': return '←→';
    default: return '?';
  }
}

function mousePressed() {
  if (keyIsDown(CONTROL)) {
    isDragging = true;
    dragStart = createVector(mouseX - panX, mouseY - panY);
    return;
  }

  let x = (mouseX - panX) / scaleFactor;
  let y = (mouseY - panY) / scaleFactor;

  // تغییر حالت قفل
  let bx = width - 60;
  let by = height - 60;
  let bs = 40;
  if (mouseX >= bx && mouseX <= bx + bs && mouseY >= by && mouseY <= by + bs) {
    lockModeIndex = (lockModeIndex + 1) % lockModes.length;
    lockDirection = (lockModes[lockModeIndex] === 'free') ? null : lockModes[lockModeIndex];
    return;
  }

  if (stage === 0) {
    vp = createVector(x, y);
    stage = 1;
    return;
  }

  if (isTrimMode) {
    trimByIntersection(x, y);
    return;
  }

  if (eraserMode) {
    for (let i = lines.length - 1; i >= 0; i--) {
      let l = lines[i];
      if (distToSegment(x, y, l.x1, l.y1, l.x2, l.y2) < 10) {
        undoStack.push({ line: l });
        lines.splice(i, 1);
        removeUnusedPoints();
        return;
      }
    }
    for (let i = points.length - 1; i >= 0; i--) {
      let p = points[i];
      if (!isNearVP(p) && dist(x, y, p.x, p.y) < snapThreshold) {
        let connected = lines.some(l =>
          (abs(l.x1 - p.x) < 1 && abs(l.y1 - p.y) < 1) ||
          (abs(l.x2 - p.x) < 1 && abs(l.y2 - p.y) < 1)
        );
        if (!connected) {
          undoStack.push({ point: p });
          points.splice(i, 1);
          return;
        }
      }
    }
    return;
  }

  if (pointName.length > 0) {
    let lowerName = pointName.toLowerCase();
    let isShortcut = shortcutKeys.includes(lowerName);
    let nameTaken = points.some(p => p.name.toLowerCase() === lowerName);
    let snap = getSnappedPoint(x, y);
    if (!isShortcut && !nameTaken && !isNearVP(snap) && !pointExists(snap)) {
      let newPoint = { name: pointName, x: snap.x, y: snap.y };
      points.push(newPoint);
      undoStack.push({ point: newPoint });
    }
    pointName = "";
    return;
  }

  let start = getSnappedPoint(x, y);
  currentLine = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
}
function mouseReleased() {
  if (isDragging) {
    isDragging = false;
    return;
  }
  if (currentLine) {
    if (dist(currentLine.x1, currentLine.y1, currentLine.x2, currentLine.y2) < 1) {
      currentLine = null;
      return;
    }
    lines.push(currentLine);
    undoStack.push({ line: currentLine });
    addAutoPoint(currentLine.x1, currentLine.y1);
    addAutoPoint(currentLine.x2, currentLine.y2);
    addIntersectionPoints(currentLine);
    currentLine = null;
  }
}

function mouseDragged() {
  if (isDragging && dragStart) {
    panX = mouseX - dragStart.x;
    panY = mouseY - dragStart.y;
    return;
  }
  if (currentLine) {
    let end = getSnappedPoint((mouseX - panX) / scaleFactor, (mouseY - panY) / scaleFactor);
    if (lockDirection === 'vertical') end.x = currentLine.x1;
    if (lockDirection === 'horizontal') end.y = currentLine.y1;
    currentLine.x2 = end.x;
    currentLine.y2 = end.y;
  }
}

function mouseWheel(event) {
  let zoom = event.delta > 0 ? 0.95 : 1.05;
  let mx = (mouseX - panX) / scaleFactor;
  let my = (mouseY - panY) / scaleFactor;
  scaleFactor *= zoom;
  panX = mouseX - mx * scaleFactor;
  panY = mouseY - my * scaleFactor;
  return false;
}
function keyPressed() {
  if (keyCode === DELETE) {
    vp = null;
    points = [];
    lines = [];
    pointName = "";
    inputBuffer = "";
    currentLine = null;
    lockDirection = null;
    autoPointIndex = 0;
    eraserMode = false;
    undoStack = [];
    showLabels = true;
    isTrimMode = false;
    commandTargetPoint = null;
    stage = 0;
    return;
  }

  if (keyCode === ENTER && pointName.length > 0) {
    let found = points.find(p => p.name.toLowerCase() === pointName.toLowerCase());
    if (found) {
      commandTargetPoint = found;
      pointName = "";
    }
  }

  if ((key === '/' || keyCode === 191) && vp) {
    drawFromPoint(vp);
    inputBuffer = "";
  }

  if (keyCode === UP_ARROW) { drawDirectional('up'); inputBuffer = ""; }
  if (keyCode === DOWN_ARROW) { drawDirectional('down'); inputBuffer = ""; }
  if (keyCode === LEFT_ARROW) { drawDirectional('left'); inputBuffer = ""; }
  if (keyCode === RIGHT_ARROW) { drawDirectional('right'); inputBuffer = ""; }

  if (key === 'T' || key === 't') { isTrimMode = !isTrimMode; return; }
  if (key === 'X' || key === 'x') { showLabels = !showLabels; return; }

  if (key.length === 1) {
    const char = key.toLowerCase();
    if (char.match(/[a-z]/i) && keyIsDown(SHIFT)) {
      if (shortcutKeys.includes(char)) return;
      pointName += char;
    }
    if (char.match(/[0-9.]/)) {
      inputBuffer += char;
    }
  }

  if (keyCode === BACKSPACE) {
    if (inputBuffer.length > 0) inputBuffer = inputBuffer.slice(0, -1);
    else if (pointName.length > 0) pointName = pointName.slice(0, -1);
  }

  if (key === '-') {
    pointName = "";
    inputBuffer = "";
    commandTargetPoint = null;
    currentLine = null;
  }

  if (key === 'E' || key === 'e') eraserMode = !eraserMode;

  if ((key === 'Z' || key === 'z') && keyIsDown(CONTROL)) {
    let last = undoStack.pop();
    if (!last) return;
    if (last.line) {
      lines = lines.filter(l => l !== last.line);
      removeUnusedPoints();
    }
    if (last.point) {
      points = points.filter(p => p.name !== last.point.name);
    }
  }
}

function drawFromPoint(vp) {
  let p = commandTargetPoint;
  let len = float(inputBuffer);
  if (!p || isNaN(len)) return;
  let dir = p5.Vector.sub(vp, createVector(p.x, p.y)).normalize().mult(len);
  let end = createVector(p.x + dir.x, p.y + dir.y);
  lines.push({ x1: p.x, y1: p.y, x2: end.x, y2: end.y });
  undoStack.push({ line: lines[lines.length - 1] });
  addAutoPoint(p.x, p.y);
  addAutoPoint(end.x, end.y);
  addIntersectionPoints({ x1: p.x, y1: p.y, x2: end.x, y2: end.y });
}

function drawDirectional(dir) {
  let p = commandTargetPoint;
  let len = float(inputBuffer);
  if (!p || isNaN(len)) return;
  let delta = createVector(0, 0);
  if (dir === 'up') delta.y = -len;
  if (dir === 'down') delta.y = len;
  if (dir === 'left') delta.x = -len;
  if (dir === 'right') delta.x = len;
  let end = createVector(p.x + delta.x, p.y + delta.y);
  lines.push({ x1: p.x, y1: p.y, x2: end.x, y2: end.y });
  undoStack.push({ line: lines[lines.length - 1] });
  addAutoPoint(p.x, p.y);
  addAutoPoint(end.x, end.y);
  addIntersectionPoints({ x1: p.x, y1: p.y, x2: end.x, y2: end.y });
}

function isNearVP(pt) {
  return vp && dist(pt.x, pt.y, vp.x, vp.y) < 15;
}
function trimByIntersection(mx, my) {
  let click = createVector(mx, my);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (distToSegment(mx, my, l.x1, l.y1, l.x2, l.y2) < 10) {
      let intersections = points.filter(p =>
        distToSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2) < 1 && !isNearVP(p)
      );
      if (intersections.length === 0) return;
      let closest = intersections.reduce((a, b) =>
        dist(a.x, a.y, click.x, click.y) < dist(b.x, b.y, click.x, click.y) ? a : b
      );
      let d1 = dist(click.x, click.y, l.x1, l.y1);
      let d2 = dist(click.x, click.y, l.x2, l.y2);
      let newLine = {
        x1: (d1 < d2) ? closest.x : l.x1,
        y1: (d1 < d2) ? closest.y : l.y1,
        x2: (d1 < d2) ? l.x2 : closest.x,
        y2: (d1 < d2) ? l.y2 : closest.y
      };
      lines.splice(i, 1, newLine);
      undoStack.push({ line: newLine });
      break;
    }
  }
}

function addIntersectionPoints(newLine) {
  for (let other of lines) {
    if (other === newLine) continue;
    let inter = getLineIntersection(newLine, other);
    if (inter && !isNearVP(inter) && !pointExists(inter)) {
      let name = getNextAlphaName();
      points.push({ name, x: inter.x, y: inter.y });
    }
  }
}

function getLineIntersection(l1, l2) {
  let a1 = createVector(l1.x1, l1.y1);
  let a2 = createVector(l1.x2, l1.y2);
  let b1 = createVector(l2.x1, l2.y1);
  let b2 = createVector(l2.x2, l2.y2);
  let d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (d === 0) return null;
  let ua = ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / d;
  let ub = ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / d;
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
  return createVector(a1.x + ua * (a2.x - a1.x), a1.y + ua * (a2.y - a1.y));
}

function addAutoPoint(x, y) {
  let pt = createVector(x, y);
  if (pointExists(pt) || isNearVP(pt)) return;
  let name = getNextAlphaName();
  let point = { name, x, y };
  points.push(point);
  undoStack.push({ point });
}

function getNextAlphaName() {
  const code = autoPointIndex++;
  const toLetters = n => {
    let s = '';
    n += 26;
    do {
      s = String.fromCharCode(97 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  };
  return toLetters(code);
}

function removeUnusedPoints() {
  points = points.filter(p => {
    return lines.some(l =>
      (abs(l.x1 - p.x) < 1 && abs(l.y1 - p.y) < 1) ||
      (abs(l.x2 - p.x) < 1 && abs(l.y2 - p.y) < 1)
    );
  });
}

function pointExists(v) {
  return points.some(p => dist(p.x, p.y, v.x, v.y) < 1);
}

function getSnappedPoint(x, y) {
  let candidates = [...points];
  if (vp) candidates.push(vp);
  for (let p of candidates) {
    if (dist(x, y, p.x, p.y) < snapThreshold) return createVector(p.x, p.y);
  }
  return createVector(x, y);
}

function drawPoint(pt, label) {
  fill(255, 0, 0);
  ellipse(pt.x, pt.y, 10);
  if (showLabels) {
    fill(0);
    text(label, pt.x + 10, pt.y);
  }
}

function drawNamedPoint(p) {
  fill(0, 150, 255);
  ellipse(p.x, p.y, 10);
  if (showLabels) {
    fill(0);
    text(p.name, p.x + 10, p.y);
  }
}

function drawLineLabel(l) {
  let mx = (l.x1 + l.x2) / 2;
  let my = (l.y1 + l.y2) / 2;
  let len = dist(l.x1, l.y1, l.x2, l.y2).toFixed(1);
  fill(0);
  text(`(${len}px)`, mx + 5, my);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  let l2 = dist(x1, y1, x2, y2) ** 2;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = constrain(t, 0, 1);
  let projX = x1 + t * (x2 - x1);
  let projY = y1 + t * (y2 - y1);
  return dist(px, py, projX, projY);
}
