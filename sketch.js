// --- 全局变量 ---
let sourceImg;          // 存储加载的图像 (p5.Image 对象)
let sourceSong;         // 存储加载的音乐
let cnv;                // p5 canvas element (so we can parent it inside a wrapper)
let fft;                // FFT (快速傅里叶变换) 分析器
let dotSize = 16;       // 像素点阵的大小 (通过滑块控制)
let bassMultiplier = 1.5; // 低音驱动视觉变化的强度

// 粒子系统
let particles = []; // { x0,y0,x,y,vx,vy,r,g,b,alpha,baseSize,seed }
// 调整参数（动感且清晰）
let CHAOS_STRENGTH = 2.5;  // 降低噪声强度 (改为可变以响应滑块)
const MOUSE_RADIUS = 120;
const MOUSE_FORCE = 3.0;
// 性能：最大粒子数上限（减少以提高性能）
const MAX_PARTICLES = 500;   // ← 降低至 500 以提高性能
// 矩形圆角半径（像素）
const RECT_CORNER_RADIUS = 2;

// 当前图像在 Canvas 中的布局（用于将 UI 定位到图像右下角）
let imgStartX = 0, imgStartY = 0, imgW = 0, imgH = 0;
// UI margin from image in pixels
const UI_MARGIN = 12; // default distance from bottom for compact UI
// Additional UI positioning constants
const UI_DEFAULT_RIGHT = 12; // default distance from right edge
const UI_MIN_DISTANCE = 80; // minimum distance between UI and image edges (in pixels)
// UI visibility state
let uiVisible = false;

// *** 请确保这些路径和 assets 文件夹中的文件完全匹配 ***
const IMAGE_PATH = 'assets/cyberpunk_image.jpg'; 
const MUSIC_PATH = 'assets/y2k_track.mp3'; 

// --- 预加载函数 (确保在 setup 之前加载资源) ---
function preload() {
    console.log("Preloading image and sound...");
    
    sourceImg = loadImage(IMAGE_PATH, 
        () => console.log(`Image '${IMAGE_PATH}' loaded OK.`),
        (e) => console.error(`[ERROR] Failed to load image '${IMAGE_PATH}'. Check path/name.`, e)
    );
    
    sourceSong = loadSound(MUSIC_PATH, 
        () => console.log(`Sound '${MUSIC_PATH}' loaded OK.`),
        (e) => console.error(`[ERROR] Failed to load sound '${MUSIC_PATH}'. Check path/name.`, e)
    );
}

// --- 设置函数 ---
function setup() {
    // 创建 canvas 并把它放到 #canvas-wrapper 中，这样 UI 可以相对 canvas 定位
    // Expand canvas height a bit more to give more visual area
    cnv = createCanvas(windowWidth * 0.75, windowHeight * 0.95);
    cnv.parent('canvas-wrapper');
    fft = new p5.FFT();
    colorMode(RGB, 255);
    rectMode(CENTER); // 矩形从中心绘制

    // 绑定 UI 滑块事件（如果存在）
    const dotSlider = document.getElementById('dot-size-slider');
    if (dotSlider) {
        dotSlider.oninput = function() {
            dotSize = parseInt(this.value);
            buildParticles();
        };
    }
    const bassSlider = document.getElementById('bass-mult-slider');
    if (bassSlider) {
        bassSlider.oninput = function() {
            bassMultiplier = parseFloat(this.value);
            // 不影响 UI 大小，但重新定位以防万一
            positionUI();
        };
    }
    const waveSlider = document.getElementById('wave-strength-slider');
    if (waveSlider) {
        waveSlider.oninput = function() {
            CHAOS_STRENGTH = parseFloat(this.value);
            positionUI();
        };
    }

    // 鼠标交互（p5 提供全局 mouseX / mouseY）
    // 将鼠标事件绑定到实际的 canvas 元素（如果需要）
    if (cnv && cnv.elt) {
        cnv.elt.addEventListener('mousemove', () => {});
    }

    // 构建粒子（必须在 image 已加载后调用）
    if (sourceImg && sourceImg.width > 0) {
        buildParticles();
        positionUI();
    }

    // 默认开始播放音乐
    if (sourceSong && sourceSong.isLoaded()) {
        sourceSong.loop();
    }

    // Play button
    const playBtn = document.getElementById('play-toggle');
    if (playBtn) {
        playBtn.onclick = function() {
            togglePlayback();
            updatePlayButtonIcon();
        };
        // Set initial icon state
        updatePlayButtonIcon();
    }

    // UI visibility: start hidden; clicking canvas shows UI; clicking UI (not on controls) hides UI
    const ui = document.getElementById('cyberpunk-ui');
    if (ui) {
        ui.classList.add('ui-hidden');
        uiVisible = false;
        // clicking within UI (but not on interactive controls) hides it
        ui.addEventListener('click', (e) => {
            if (e.target.closest('input, button')) return; // don't hide when interacting with controls
            hideUI();
        });
    }
    if (cnv && cnv.elt) {
        cnv.elt.addEventListener('click', () => {
            if (!uiVisible) showUI();
        });
    }
}

// --- 主绘图循环 ---
function draw() {
    background(0);

    if (!sourceImg || sourceImg.width === 0) {
        fill(255, 0, 0);
        textAlign(CENTER, CENTER);
        textSize(16);
        text("图像加载失败！请检查文件名和路径。", width / 2, height / 2);
        return;
    }

    // 音频分析
    let bass = 0;
    if (sourceSong && sourceSong.isLoaded() && sourceSong.isPlaying()) {
        fft.analyze();
        bass = fft.getEnergy('bass');
    }

    // 画面保持稳定（无全局抖动）— 仅粒子会律动

    // 更新并绘制粒子
    noStroke();
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 基于低频的推动力（增强响应）
        const audioForce = map(bass * bassMultiplier, 0, 255 * bassMultiplier, 0, 2.2);

        // 混沌噪声（平滑）
        const t = frameCount * 0.01;
        const nx = (noise(p.seed + t) - 0.5) * CHAOS_STRENGTH * 0.45;
        const ny = (noise(p.seed + 100 + t) - 0.5) * CHAOS_STRENGTH * 0.45;

        // 弹簧力拉回原位（增强）
        const k = 0.08 * (1 + audioForce * 1.0);
        let fx = (p.x0 - p.x) * k + nx;
        let fy = (p.y0 - p.y) * k + ny;

        // 鼠标悬停交互（斥力）
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const d = sqrt(dx * dx + dy * dy) + 0.0001;
        if (d < MOUSE_RADIUS) {
            const push = (1 - d / MOUSE_RADIUS) * MOUSE_FORCE * (1 + audioForce);
            fx += (dx / d) * push;
            fy += (dy / d) * push;
        }

        // 更新速度与位置（阻尼）
        p.vx = (p.vx + fx) * 0.88;
        p.vy = (p.vy + fy) * 0.88;
        p.x += p.vx;
        p.y += p.vy;

        // 大小随音量变化（增强响应）
        const sz = p.baseSize * (0.5 + 2.8 * audioForce);

        // 带圆角矩形粒子绘制
        const col = color(p.r, p.g, p.b, p.alpha * 255);
        fill(col);
        drawingContext.shadowBlur = max(0.3, sz * 0.6);
        drawingContext.shadowColor = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.alpha * 0.7})`;
        rect(p.x, p.y, sz, sz, RECT_CORNER_RADIUS);
        drawingContext.shadowBlur = 0;
    }
}

// --- 音乐控制函数 ---
function togglePlayback() {
    if (sourceSong && sourceSong.isLoaded()) {
        if (sourceSong.isPlaying()) {
            sourceSong.pause();
        } else {
            sourceSong.loop(); 
        }
        // reflect play state on button
        updatePlayButtonIcon();
    }
}

function updatePlayButtonIcon() {
    const btn = document.getElementById('play-toggle');
    if (!btn) return;
    if (sourceSong && sourceSong.isLoaded() && sourceSong.isPlaying()) {
        btn.textContent = '⏸';
        btn.classList.add('playing');
    } else {
        btn.textContent = '▶︎';
        btn.classList.remove('playing');
    }
    // 重新布局 UI，以防按钮宽度改变
    positionUI();
}

function showUI() {
    const ui = document.getElementById('cyberpunk-ui');
    if (!ui) return;
    ui.classList.remove('ui-hidden');
    ui.classList.add('ui-visible');
    uiVisible = true;
    positionUI();
}

function hideUI() {
    const ui = document.getElementById('cyberpunk-ui');
    if (!ui) return;
    ui.classList.remove('ui-visible');
    ui.classList.add('ui-hidden');
    uiVisible = false;
}

// --- 窗口大小改变时重设 Canvas ---
function windowResized() {
    resizeCanvas(windowWidth * 0.75, windowHeight * 0.85);
    // 重新计算粒子布局
    buildParticles();
    positionUI();
}

/**
 * 构建粒子数组：每个采样点成为一个可移动粒子
 */
function buildParticles() {
    particles = [];
    if (!sourceImg || sourceImg.width === 0) return;

    sourceImg.loadPixels();

    // 计算缩放比例，使图像居中填充 Canvas
    let imgRatio = sourceImg.width / sourceImg.height;
    let canvasRatio = width / height;
    let w, h;

    if (imgRatio > canvasRatio) {
        h = height;
        w = h * imgRatio;
    } else {
        w = width;
        h = w / imgRatio;
    }
    let startX = (width - w) / 2;
    let startY = (height - h) / 2;
    // 记录当前图像在 canvas 中的布局
    imgStartX = startX;
    imgStartY = startY;
    imgW = w;
    imgH = h;

    // 计算自适应采样步长，保证不超过 MAX_PARTICLES
    const approxCols = Math.max(1, Math.floor(w / dotSize));
    const approxRows = Math.max(1, Math.floor(h / dotSize));
    const approxTotal = approxCols * approxRows;
    let step = dotSize;
    if (approxTotal > MAX_PARTICLES) {
        // 需要增大采样步长：按 sqrt 比例增加步长
        const scale = Math.sqrt(approxTotal / MAX_PARTICLES);
        step = Math.ceil(dotSize * scale);
    }

    for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
            let originalX = floor(x * sourceImg.width / w);
            let originalY = floor(y * sourceImg.height / h);
            const index = (originalX + originalY * sourceImg.width) * 4;
            const r = sourceImg.pixels[index];
            const g = sourceImg.pixels[index + 1];
            const b = sourceImg.pixels[index + 2];

            // 色彩映射（Y2K 风格）
            let colorR = constrain(r, 0, 255);
            let colorG = constrain(g * 0.6, 0, 180);
            let colorB = constrain(b, 0, 255);

            const px = startX + x;
            const py = startY + y;

            particles.push({
                x0: px,
                y0: py,
                x: px + random(-5, 5),
                y: py + random(-5, 5),
                vx: random(-0.5, 0.5),
                vy: random(-0.5, 0.5),
                r: colorR,
                g: colorG,
                b: colorB,
                alpha: constrain((r + g + b) / (3 * 255), 0.3, 1.0),
                baseSize: dotSize * 0.7,
                seed: random(1000)
            });
        }
    }

    // 在每次构建颗粒后定位 UI 到图像正下方（居中）
    positionUI();
}

/**
 * 根据当前 imgStartX/imgStartY/imgW/imgH 计算并设置 UI 的左/顶坐标。
 * 这样 UI 会停靠在图片的右下角（图片可能未填满整个 canvas）。
 */
function positionUI() {
    const ui = document.getElementById('cyberpunk-ui');
    if (!ui || !cnv) return;

    // 确保 UI 的尺寸可以读取
    ui.style.right = 'auto';
    ui.style.bottom = 'auto';
    const uiRect = ui.getBoundingClientRect();
    const uiWidth = uiRect.width;
    const uiHeight = uiRect.height;

    // UI is fixed to the viewport bottom-right by default. We'll place it and ensure it doesn't overlap the image.
    ui.style.position = 'fixed';
    ui.style.left = 'auto';
    ui.style.transform = 'none';
    // Set default right and bottom
    let rightPx = UI_DEFAULT_RIGHT;
    let bottomPx = UI_MARGIN;
    ui.style.right = `${rightPx}px`;
    ui.style.bottom = `${bottomPx}px`;
    ui.style.top = 'auto';

    // Recompute uiRect as the size will be used for collision checks
    const uiRectAfter = ui.getBoundingClientRect();
    const uiWidth2 = uiRectAfter.width;
    const uiHeight2 = uiRectAfter.height;

    // Compute image rectangle in screen coordinates
    const canvasRect = cnv.elt.getBoundingClientRect();
    const imgScreenLeft = canvasRect.left + imgStartX;
    const imgScreenTop = canvasRect.top + imgStartY;
    const imgScreenRight = imgScreenLeft + imgW;
    const imgScreenBottom = imgScreenTop + imgH;

    // Compute UI rectangle when at default right/bottom
    const uiRightX = window.innerWidth - rightPx;
    const uiLeftX = uiRightX - uiWidth2;
    const uiBottomY = window.innerHeight - bottomPx;
    const uiTopY = uiBottomY - uiHeight2;

    // Evaluate gaps
    const horizontalGap = Math.max(0, imgScreenRight - uiLeftX);
    const verticalGap = Math.max(0, imgScreenBottom - uiTopY);

    // If too close horizontally or vertically, push UI away (prefer upward movement)
    if (verticalGap > 0 && verticalGap < UI_MIN_DISTANCE) {
        // Need extra space: compute required bottomPx to move UI up so the top of UI is at least MIN_DISTANCE above image bottom
        const requiredBottom = window.innerHeight - (imgScreenBottom - UI_MIN_DISTANCE) - uiHeight2;
        bottomPx = Math.max(bottomPx, Math.ceil(requiredBottom));
    }
    if (horizontalGap > 0 && horizontalGap < UI_MIN_DISTANCE) {
        // Push left by increasing rightPx
        const requiredRight = Math.max(rightPx, Math.ceil(window.innerWidth - (imgScreenRight + UI_MIN_DISTANCE + uiWidth2)));
        if (requiredRight > rightPx) rightPx = requiredRight;
    }

    // Apply final positions
    if (bottomPx < 6) bottomPx = 6;
    if (rightPx < 6) rightPx = 6;
    ui.style.bottom = `${bottomPx}px`;
    ui.style.right = `${rightPx}px`;
}