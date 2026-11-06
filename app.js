(() => {
  // ==========================================================================
  // CANVAS BACKGROUND SCROLL ANIMATION ENGINE
  // ==========================================================================
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', {
    alpha: false,
    desynchronized: false
  });

  // Device Detection & Adaptive Performance Mode
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

  // Stable Canvas Sizing (Max DPR 1 on mobile to prevent GPU crash, 1.5 on desktop)
  let lastWindowWidth = 0;
  let lastWindowHeight = 0;

  function resizeCanvas(force = false) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Ignore mobile address-bar collapse height fluctuations to prevent thrashing
    if (!force && width === lastWindowWidth && Math.abs(height - lastWindowHeight) < 80) {
      return;
    }

    lastWindowWidth = width;
    lastWindowHeight = height;

    const isUltraWideScreen = (width / height) >= 2.0 || width >= 3400;
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, isUltraWideScreen ? 1.25 : 1.5);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    lastRenderedIndex = -1;
    cachedGradKey = '';
    drawCurrentProgress();
  }

  // Offscreen canvas for zero-seam alpha feathering on ultra-wide viewports
  let featherCanvas = null;
  let featherCtx = null;

  // Cached gradients for ultra-wide rendering (prevents recreating CanvasGradients on every frame)
  let cachedAmbientBg = null;
  let cachedMaskGrad = null;
  let cachedCornerVignette = null;
  let cachedGradKey = '';

  function getFeatherContext(w, h) {
    if (!featherCanvas) {
      featherCanvas = document.createElement('canvas');
    }
    if (featherCanvas.width !== w || featherCanvas.height !== h) {
      featherCanvas.width = w;
      featherCanvas.height = h;
      featherCtx = featherCanvas.getContext('2d', { alpha: true });
    }
    return featherCtx;
  }

  // Draw frame on canvas with object-fit: cover and mobile-aware alignment
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

    // Detect Super Ultra-Wide (Samsung Odyssey G9 32:9 ~ 3.55, 21:9 ~ 2.33)
    const isUltraWide = canvasAspect >= 2.0;

    if (isUltraWide) {
      // 32:9 Samsung Odyssey G9 & Super Ultra-wide Optimization:
      // 1. Maintain true character proportions: fit height so character's head,
      //    forehead, eyes, face, and shoulders are NEVER cropped vertically by top of monitor.
      drawHeight = canvasHeight;
      drawWidth = Math.round(drawHeight * imageAspect);
      offsetY = 0;

      // 2. Horizontal placement: place character in center stage (leaving left stage completely clear for hero text)
      offsetX = Math.round((canvasWidth - drawWidth) * 0.54);

      // 3. Paint continuous, seamless red studio backdrop across entire 5120px display
      // Center the radial spotlight behind the character
      const spotX = offsetX + drawWidth * 0.46;
      const spotY = canvasHeight * 0.46;
      const maxRadius = Math.max(canvasWidth * 0.68, 3000);

      const fCtx = getFeatherContext(drawWidth, drawHeight);

      // Cache gradients across frames to eliminate per-frame GPU allocation and garbage collection stalls
      const currentGradKey = `${canvasWidth}_${canvasHeight}_${drawWidth}_${drawHeight}_${offsetX}`;
      if (cachedGradKey !== currentGradKey || !cachedAmbientBg || !cachedMaskGrad || !cachedCornerVignette) {
        cachedGradKey = currentGradKey;

        // Ambient red studio backdrop
        cachedAmbientBg = ctx.createRadialGradient(
          spotX, spotY, 60,
          spotX, spotY, maxRadius
        );
        cachedAmbientBg.addColorStop(0, '#ad0005');    // Visually rich, vibrant illuminated core red
        cachedAmbientBg.addColorStop(0.22, '#850003'); // Smooth mid-red transition
        cachedAmbientBg.addColorStop(0.45, '#520002'); // Atmospheric deep red
        cachedAmbientBg.addColorStop(0.72, '#280001'); // Dark burgundy
        cachedAmbientBg.addColorStop(0.90, '#120001'); // Subtle dark edge vignette
        cachedAmbientBg.addColorStop(1.0, '#040000');  // Outer corner dark vignette

        // Alpha feather mask for character outer edges
        if (fCtx) {
          cachedMaskGrad = fCtx.createLinearGradient(0, 0, drawWidth, 0);
          const edgePct = 0.22;
          cachedMaskGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          cachedMaskGrad.addColorStop(edgePct * 0.35, 'rgba(0, 0, 0, 0.18)');
          cachedMaskGrad.addColorStop(edgePct * 0.70, 'rgba(0, 0, 0, 0.65)');
          cachedMaskGrad.addColorStop(edgePct, 'rgba(0, 0, 0, 1)');
          cachedMaskGrad.addColorStop(1 - edgePct, 'rgba(0, 0, 0, 1)');
          cachedMaskGrad.addColorStop(1 - edgePct * 0.70, 'rgba(0, 0, 0, 0.65)');
          cachedMaskGrad.addColorStop(1 - edgePct * 0.35, 'rgba(0, 0, 0, 0.18)');
          cachedMaskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        // Subtle dark/blackish vignette towards the outer corners of the 49" curved screen
        cachedCornerVignette = ctx.createRadialGradient(
          canvasWidth * 0.5, canvasHeight * 0.5, canvasHeight * 0.45,
          canvasWidth * 0.5, canvasHeight * 0.5, Math.hypot(canvasWidth * 0.5, canvasHeight * 0.5)
        );
        cachedCornerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        cachedCornerVignette.addColorStop(0.68, 'rgba(0, 0, 0, 0)');
        cachedCornerVignette.addColorStop(0.88, 'rgba(0, 0, 0, 0.38)');
        cachedCornerVignette.addColorStop(1.0, 'rgba(0, 0, 0, 0.75)');
      }

      ctx.fillStyle = cachedAmbientBg;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 4. Render character frame with smooth alpha-feathered outer edges
      // This completely eliminates harsh vertical boundaries and rectangular patches
      if (fCtx && cachedMaskGrad) {
        fCtx.clearRect(0, 0, drawWidth, drawHeight);
        fCtx.imageSmoothingEnabled = true;
        fCtx.imageSmoothingQuality = 'high';
        fCtx.drawImage(frame, 0, 0, drawWidth, drawHeight);

        // Alpha feather the outer 22% on left and right edges into transparency
        fCtx.globalCompositeOperation = 'destination-in';
        fCtx.fillStyle = cachedMaskGrad;
        fCtx.fillRect(0, 0, drawWidth, drawHeight);
        fCtx.globalCompositeOperation = 'source-over';

        // Draw feathered frame onto the continuous background
        ctx.drawImage(featherCanvas, offsetX, offsetY);
      } else {
        ctx.drawImage(frame, offsetX, offsetY, drawWidth, drawHeight);
      }

      // 5. Subtle dark/blackish vignette towards the outer corners of the 49" curved screen
      ctx.fillStyle = cachedCornerVignette;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else if (canvasAspect > imageAspect) {
      // Desktop / widescreen: standard cover
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imageAspect;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = isMobile ? 'low' : 'high';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(frame, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      // Mobile / Portrait view:
      const scaleMultiplier = isMobile ? 0.90 : 1.0;
      
      drawHeight = canvasHeight * scaleMultiplier;
      drawWidth = drawHeight * imageAspect;
      offsetY = (canvasHeight - drawHeight) / 2;

      // Shift subject background portrait to the right side (object-position: ~65% center)
      const focalX = isMobile ? 0.30 : 0.5;
      offsetX = (canvasWidth - drawWidth) * focalX;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = isMobile ? 'low' : 'high';
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(frame, offsetX, offsetY, drawWidth, drawHeight);
    }

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

  // Memory-Safe Frame Preload Pipeline with Mobile Downscaling
  async function loadAndDecodeFrame(index) {
    if (frames[index]) return;

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

      // On mobile, downscale to 960x540 to avoid iOS WebKit 200MB memory crash limit
      if (window.createImageBitmap) {
        try {
          const bitmapOptions = isMobile
            ? { resizeWidth: 960, resizeHeight: 540, resizeQuality: 'medium' }
            : {};
          const bitmap = await createImageBitmap(img, bitmapOptions);
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
        // Invalidate lastRenderedIndex so the requestAnimationFrame loop renders the decoded frame
        // synchronously on the next display refresh, avoiding thread contention and mid-frame tears
        lastRenderedIndex = -1;
      }
    } catch (err) {
      // Fallback silently if frame fails
    }
  }

  async function preloadAllFrames() {
    // 1. Instant paint frame 0
    await loadAndDecodeFrame(0);

    // 2. Mobile strategy: sample every 3rd frame (approx 40 keyframes = smooth animation without WebKit RAM exhaustion)
    // Desktop strategy: load all 118 frames
    const frameStep = isMobile ? 3 : 1;
    const targetIndices = [];

    for (let i = 1; i < frameCount; i += frameStep) {
      targetIndices.push(i);
    }
    // Always include the last frame so scroll animation finishes cleanly
    if (!targetIndices.includes(frameCount - 1)) {
      targetIndices.push(frameCount - 1);
    }

    // Load sequentially in small batches of 4 to keep network and main thread silky smooth
    const batchSize = isMobile ? 4 : 8;
    for (let i = 0; i < targetIndices.length; i += batchSize) {
      const batch = targetIndices.slice(i, i + batchSize).map(idx => loadAndDecodeFrame(idx));
      await Promise.all(batch);
      // Small pause between batches on mobile to let garbage collector run and avoid memory spikes
      if (isMobile) {
        await new Promise(r => setTimeout(r, 40));
      }
    }
  }

  // ==========================================================================
  // INTERACTIVE UI FEATURES
  // ==========================================================================

  // Portfolio Filtering & Video Modal Player
  const filterButtons = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');
  const videoModal = document.getElementById('video-modal');
  const modalVideoPlayer = document.getElementById('modal-video-player');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalTitle = document.getElementById('modal-title');
  const modalCategory = document.getElementById('modal-category');
  const modalQualityBadge = document.getElementById('modal-quality-badge');

  // Filter Tabs
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

  // Open Video Modal on Card Click
  function openVideoModal(videoSrc, title, category) {
    if (!videoModal || !modalVideoPlayer) return;

    const modalContainer = videoModal.querySelector('.video-modal-container');
    if (modalContainer) {
      const isUltraWideModal = (window.innerWidth / window.innerHeight) >= 2.0 || window.innerWidth >= 3400;
      if (category === 'long-form') {
        modalContainer.style.maxWidth = window.innerWidth <= 768 ? '95%' : (isUltraWideModal ? '1320px' : '920px');
      } else {
        modalContainer.style.maxWidth = window.innerWidth <= 768 ? '360px' : (isUltraWideModal ? '520px' : '460px');
      }
    }

    modalVideoPlayer.src = videoSrc;
    if (modalTitle) modalTitle.textContent = title || 'Video Preview';
    if (modalCategory) modalCategory.textContent = category === 'long-form' ? 'LONG-FORM CONTENT' : 'SHORT-FORM CONTENT';
    if (modalQualityBadge) modalQualityBadge.textContent = '1080P FULL HD';

    videoModal.classList.add('active');
    videoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Play video with audio
    modalVideoPlayer.currentTime = 0;
    const playPromise = modalVideoPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy fallback
      });
    }
  }

  function closeVideoModal() {
    if (!videoModal || !modalVideoPlayer) return;

    modalVideoPlayer.pause();
    modalVideoPlayer.src = '';
    videoModal.classList.remove('active');
    videoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Attach card click listeners
  projectCards.forEach(card => {
    card.addEventListener('click', () => {
      const videoSrc = card.getAttribute('data-video');
      const title = card.getAttribute('data-title');
      const category = card.getAttribute('data-category');
      if (videoSrc) {
        openVideoModal(videoSrc, title, category);
      }
    });
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeVideoModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeVideoModal);
  }

  // Close modal on ESC key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && videoModal && videoModal.classList.contains('active')) {
      closeVideoModal();
    }
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

  // Mobile Nav Drawer Toggle
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  if (navToggleBtn && mobileDrawer) {
    navToggleBtn.addEventListener('click', () => {
      const isOpen = mobileDrawer.classList.toggle('open');
      navToggleBtn.classList.toggle('open', isOpen);
      navToggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Close drawer automatically when a navigation link is clicked
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        navToggleBtn.classList.remove('open');
        navToggleBtn.setAttribute('aria-expanded', 'false');
      });
    });

    // Close drawer when clicking outside
    document.addEventListener('click', (e) => {
      if (mobileDrawer.classList.contains('open') && !navToggleBtn.contains(e.target) && !mobileDrawer.contains(e.target)) {
        mobileDrawer.classList.remove('open');
        navToggleBtn.classList.remove('open');
        navToggleBtn.setAttribute('aria-expanded', 'false');
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
