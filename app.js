(() => {
  // ==========================================================================
  // CANVAS BACKGROUND SCROLL ANIMATION ENGINE
  // ==========================================================================
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });

  // Full 118-frame sequence: maps scroll progress from Frame 1 to Frame 118
  const frameCount = 118;
  const frames = new Array(frameCount);
  let initialFrameLoaded = false;
  let lastRenderedIndex = -1;

  // Frame path generator: ezgif-frame-001.png ... ezgif-frame-118.png
  const getFramePath = (index) => {
    const padded = String(index + 1).padStart(3, '0');
    return `ezgif-frame-${padded}.png`;
  };

  // State
  let targetProgress = 0; // 0.0 to 1.0
  let currentProgress = 0; // 0.0 to 1.0
  let lastTimestamp = performance.now();
  const DAMPING = 8.5; // Smooth exponential decay rate

  // High-DPI Canvas Sizing
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    lastRenderedIndex = -1;
    drawCurrentProgress();
  }

  // Draw frame on canvas with object-fit: cover
  function drawFrame(frameIndex) {
    const clampedIndex = Math.max(0, Math.min(frameCount - 1, frameIndex));
    
    // Retrieve frame or nearest loaded neighbor
    let frame = frames[clampedIndex];
    if (!frame) {
      for (let offset = 1; offset < frameCount; offset++) {
        const prev = clampedIndex - offset;
        const next = clampedIndex + offset;
        if (prev >= 0 && frames[prev]) {
          frame = frames[prev];
          break;
        }
        if (next < frameCount && frames[next]) {
          frame = frames[next];
          break;
        }
      }
    }

    if (!frame) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const frameWidth = frame.width || frame.naturalWidth;
    const frameHeight = frame.height || frame.naturalHeight;

    if (!frameWidth || !frameHeight) return;

    const imageAspect = frameWidth / frameHeight;
    const canvasAspect = canvasWidth / canvasHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasAspect > imageAspect) {
      // Desktop / widescreen: standard cover
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imageAspect;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else {
      // Portrait / Mobile view:
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imageAspect;
      offsetY = 0;

      // On mobile screens (portrait view), shift the character toward the right side
      // so hero text on the left doesn't cover his face
      const isMobile = window.innerWidth <= 768;
      const focalX = isMobile ? 0.38 : 0.5;
      offsetX = (canvasWidth - drawWidth) * focalX;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(frame, offsetX, offsetY, drawWidth, drawHeight);

    lastRenderedIndex = clampedIndex;
  }

  function drawCurrentProgress() {
    const targetIndex = Math.round(currentProgress * (frameCount - 1));
    if (targetIndex !== lastRenderedIndex) {
      drawFrame(targetIndex);
    }
  }

  // Read native page scroll progress & toggle mouse indicator fade
  const scrollIndicator = document.getElementById('scroll-indicator');

  function updateScrollProgress() {
    const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 1;
    const clientHeight = window.innerHeight || 1;
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    
    targetProgress = Math.max(0, Math.min(1, scrollTop / maxScroll));

    if (scrollIndicator) {
      if (scrollTop > 20) {
        scrollIndicator.classList.add('faded');
      } else {
        scrollIndicator.classList.remove('faded');
      }
    }
  }

  // Animation Loop with delta-time compensated exponential smoothing
  function animate(now) {
    const dt = Math.min((now - lastTimestamp) / 1000, 0.1);
    lastTimestamp = now;

    updateScrollProgress();

    // Smooth exponential lerp
    const factor = 1 - Math.exp(-DAMPING * dt);
    const diff = targetProgress - currentProgress;

    if (Math.abs(diff) > 0.00001) {
      currentProgress += diff * factor;
    } else {
      currentProgress = targetProgress;
    }

    drawCurrentProgress();

    requestAnimationFrame(animate);
  }

  // Frame Preload Pipeline with ImageBitmap GPU conversion
  async function loadAndDecodeFrame(index) {
    try {
      const img = new Image();
      img.src = getFramePath(index);
      
      if ('decode' in img) {
        await img.decode();
      } else {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
      }

      if (window.createImageBitmap) {
        try {
          const bitmap = await createImageBitmap(img);
          frames[index] = bitmap;
        } catch (e) {
          frames[index] = img;
        }
      } else {
        frames[index] = img;
      }

      if (index === 0 && !initialFrameLoaded) {
        initialFrameLoaded = true;
        drawFrame(0);
      } else if (Math.round(currentProgress * (frameCount - 1)) === index) {
        drawFrame(index);
      }
    } catch (err) {
      // Fallback
    }
  }

  async function preloadAllFrames() {
    // Instant paint frame 0
    await loadAndDecodeFrame(0);

    // Stream remaining frames in batches of 10
    const batchSize = 10;
    for (let i = 1; i < frameCount; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, frameCount); j++) {
        batch.push(loadAndDecodeFrame(j));
      }
      await Promise.all(batch);
    }
  }

  // ==========================================================================
  // INTERACTIVE UI FEATURES
  // ==========================================================================

  // Portfolio Filtering
  const filterButtons = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      projectCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.classList.remove('hidden');
        } else {
          card.classList.add('hidden');
        }
      });

      // Update scroll bounds
      updateScrollProgress();
    });
  });

  // Copy Email to Clipboard
  const emailBtn = document.getElementById('email-btn');
  const copyBadge = document.getElementById('copy-badge');

  if (emailBtn && copyBadge) {
    emailBtn.addEventListener('click', async () => {
      const email = 'workarjunshoor@gmail.com';
      try {
        await navigator.clipboard.writeText(email);
        copyBadge.textContent = 'COPIED!';
        copyBadge.style.backgroundColor = 'var(--accent-red)';
        
        setTimeout(() => {
          copyBadge.textContent = 'COPY';
          copyBadge.style.backgroundColor = '';
        }, 2000);
      } catch (err) {
        window.location.href = `mailto:${email}`;
      }
    });
  }

  // Event Listeners
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('scroll', updateScrollProgress, { passive: true });

  // Init
  resizeCanvas();
  updateScrollProgress();
  preloadAllFrames();
  requestAnimationFrame(animate);
})();
