// Функция для разблокировки аудиоконтекста на мобильных устройствах
function unlockAudioContext() {
  // Создаем временный аудиоконтекст для разблокировки звуков
  const tempContext = new (window.AudioContext || window.webkitAudioContext)();
  
  // Создаем и немедленно запускаем пустой звук для разблокировки звуков на iOS/Safari
  const emptySource = tempContext.createBufferSource();
  emptySource.buffer = tempContext.createBuffer(1, 1, 22050);
  emptySource.connect(tempContext.destination);
  emptySource.start(0);
  
  console.log('Audio context unlocked for mobile');
  
  // Очищаем обработчики событий после разблокировки
  document.removeEventListener('touchstart', unlockAudioContext);
  document.removeEventListener('touchend', unlockAudioContext);
  document.removeEventListener('click', unlockAudioContext);
}

// Функция для принудительной разблокировки аудио на iOS
function forceIOSAudioUnlock() {
  // Создаем и играем тихий звук, чтобы разблокировать WebAudio на iOS
  if (typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined') {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const unlockBuffer = audioContext.createBuffer(1, 1, 22050);
      const unlockSource = audioContext.createBufferSource();
      unlockSource.buffer = unlockBuffer;
      unlockSource.connect(audioContext.destination);
      unlockSource.start(0);
      unlockSource.disconnect();
      
      console.log('iOS audio context forced unlock');
      
      // Если контекст был в suspended состоянии, пробуем его разблокировать
      if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
              console.log('Audio context resumed successfully');
          });
      }
  }
}

// Define global variables
let cloudEffects = {};
let currentSection = "landing";
const sections = ["intro", "home", "work", "stack", "contact"];
let isAnimating = false;
let globeEffect;
let sharedCloudEffect;
let soundEnabled = false;
let audioContext;
let backgroundMusic;
let isMobileDevice;

// Глобальные ограничители для звуков
window._lastClickSoundTime = 0;
window._lastSectionSoundTime = 0;


const deviceInfo = detectDevice();
isMobileDevice = deviceInfo.isMobile;


// Mobile detection function
function detectDevice() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = /macintosh|mac os x/i.test(userAgent);
  const isIOS = /ipad|iphone|ipod/.test(userAgent) || 
                (isMac && navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  const hasRetina = window.devicePixelRatio > 1.5;
  
  return {
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent),
      isMac: isMac,
      isIOS: isIOS,
      isSafari: isSafari,
      hasRetina: hasRetina
  };
}
if (deviceInfo.isMac || deviceInfo.isSafari) {
  // Дополнительная обработка специфичных особенностей Safari
  document.addEventListener('gesturestart', function(e) {
      // Предотвращаем стандартные жесты масштабирования на Mac
      e.preventDefault();
  });
  
  // Более агрессивный подход к разблокировке аудио в Safari
  if (deviceInfo.isSafari) {
      window.addEventListener('click', function safariAudioUnlock() {
          soundManager.forceAudioUnlock();
          // Пытаемся также воспроизвести фоновую музыку
          if (soundManager.enabled && soundManager.backgroundMusic && 
              soundManager.backgroundMusic.paused && currentSection !== 'landing') {
              soundManager.startBackgroundMusic();
          }
          window.removeEventListener('click', safariAudioUnlock);
      }, { once: true });
  }
  
  // Для Retina-дисплеев
  if (deviceInfo.hasHighDPI) {
      // Оптимизация для дисплеев с высоким DPI
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({ resolution: 40 }); // Увеличенное разрешение для Retina
      }
  }
}

if (deviceInfo.isMac) {
  document.addEventListener('wheel', (e) => {
      // Определяем, что это, вероятно, трекпад, по "плавной прокрутке"
      const isTrackpadScrolling = Math.abs(e.deltaY) < 10;
      
      if (isTrackpadScrolling) {
          // Для трекпада нужно накапливать значения для более плавной навигации
          if (!window._trackpadAccumulator) window._trackpadAccumulator = 0;
          window._trackpadAccumulator += e.deltaY;
          
          // Меняем секцию только когда накоплено достаточное значение
          if (Math.abs(window._trackpadAccumulator) > 40) {
              const direction = window._trackpadAccumulator > 0 ? 1 : -1;
              window._trackpadAccumulator = 0; // Сбрасываем аккумулятор
              
              // Используем существующую логику смены секции
              const currentIndex = sections.indexOf(currentSection);
              const newIndex = currentIndex + direction;
              if (newIndex >= 0 && newIndex < sections.length && !isAnimating) {
                  changeSection(sections[newIndex]);
              }
          }
      }
  }, { passive: true });
}

// Sound Manager - полностью переработанная версия
class SoundManager {
  constructor() {
      this.enabled = false;
      this.sounds = {};
      this.soundInstances = {}; // Store multiple instances of each sound
      this.backgroundMusic = null;
      this.throttles = {};
      this.initialized = false;
      this.context = null;
      this.fadeInterval = null;
      this.backgroundMusicStarted = false;
      this.lastHoverTime = 0;
      this.lastClickTime = 0;
      this.lastSectionTime = 0;
      this.clickBlocker = false;
      this.sectionBlocker = false;
  }

  // Initialize the sound system with improved error handling
  init() {
      if (this.initialized) return;
      
      console.log('Initializing sound manager');
      
      try {
          // Create sound catalog with number of instances for each sound
          const soundConfig = {
              'click': { src: 'sounds/click.wav', volume: 0.4, throttle: 300, instances: 3 },
              'hover': { src: 'sounds/hover.wav', volume: 0.1, throttle: 300, instances: 2 },
              'blink': { src: 'sounds/blink.wav', volume: 0.9, throttle: 300, instances: 2 },
              'section': { src: 'sounds/section-change.mp3', volume: 0.04, throttle: 1000, instances: 2 },
              'background': { src: 'sounds/background-music.mp3', volume: 0.3, throttle: 0, instances: 1 }
          };

          // Create and configure audio elements with multiple instances for each
          for (const [id, config] of Object.entries(soundConfig)) {
              this.soundInstances[id] = [];
              this.sounds[id] = { 
                  config: config,
                  currentInstance: 0
              };
              
              // Create the specified number of instances for each sound
              for (let i = 0; i < config.instances; i++) {
                  try {
                      const audio = new Audio();
                      audio.src = config.src;
                      audio.preload = 'auto';
                      audio.volume = config.volume;
                      
                      // Add event listeners to track loading errors
                      audio.addEventListener('error', (e) => {
                          console.warn(`Sound ${id} failed to load:`, e);
                      });
                      
                      // Store the audio instance
                      this.soundInstances[id].push(audio);
                      
                      // Setup background music separately
                      if (id === 'background' && i === 0) {
                          this.backgroundMusic = audio;
                          this.backgroundMusic.loop = true;
                      }
                  } catch (e) {
                      console.error(`Error creating audio instance for ${id}:`, e);
                  }
              }
          }
          
          // Setup Web Audio API (will be initialized on user interaction)
          try {
              window.AudioContext = window.AudioContext || window.webkitAudioContext;
          } catch (e) {
              console.warn('Web Audio API not supported in this browser');
          }
          
          this.initialized = true;
          console.log('Sound manager initialized with multiple instances per sound');
      } catch (err) {
          console.error("Sound system initialization failed:", err);
      }
  }
  
  // Enable sound system with robust error handling
  enable() {
      try {
          if (!this.initialized) this.init();
          
          // Already enabled, do nothing
          if (this.enabled) return;
          
          this.enabled = true;
          console.log('Sound system enabled');
          
          // Initialize Web Audio Context if possible
          if (!this.context && window.AudioContext) {
              try {
                  this.context = new AudioContext();
                  
                  // Force iOS to unlock audio context
                  if (this.context.state === 'suspended') {
                      this.context.resume().then(() => {
                          console.log('Audio context resumed');
                      }).catch(e => {
                          console.warn('Error resuming audio context:', e);
                      });
                  }
              } catch (e) {
                  console.warn('Could not create audio context:', e);
              }
          }
          
          // Update UI
          this.updateUI(true);
          
          // Reset all throttle blockers
          this.clickBlocker = false;
          this.sectionBlocker = false;
          
      } catch (err) {
          console.error("Error enabling sound system:", err);
      }
  }
  
  // Start background music with improved error handling
  startBackgroundMusic() {
      if (!this.enabled || this.backgroundMusicStarted || !this.backgroundMusic) return;
      
      try {
          console.log('Starting background music');
          this.backgroundMusicStarted = true;
          
          // Clear any existing fade interval
          if (this.fadeInterval) {
              clearInterval(this.fadeInterval);
              this.fadeInterval = null;
          }
          
          // Start background music with fade-in
          this.backgroundMusic.volume = 0;
          
          // Reset playback position only if it's not already playing
          if (this.backgroundMusic.paused) {
              this.backgroundMusic.currentTime = 0;
              
              const promise = this.backgroundMusic.play();
              if (promise !== undefined) {
                  promise.catch(error => {
                      console.warn('Auto-play prevented. User interaction required:', error);
                      this.backgroundMusicStarted = false;
                      
                      // Force unlock audio on iOS/Safari
                      this.forceAudioUnlock();
                      
                      // Add event listener to try again on user interaction (once)
                      const retryPlay = () => {
                          if (!this.backgroundMusicStarted && this.enabled) {
                              setTimeout(() => {
                                  this.startBackgroundMusic();
                              }, 200);
                          }
                          document.removeEventListener('click', retryPlay);
                          document.removeEventListener('touchstart', retryPlay);
                      };
                      
                      document.addEventListener('click', retryPlay, { once: true });
                      document.addEventListener('touchstart', retryPlay, { once: true });
                  });
              }
          }
          
          // Gradually increase volume
          let volume = 0;
          const targetVolume = this.sounds['background'].config.volume;
          const step = 0.02;
          
          this.fadeInterval = setInterval(() => {
              if (!this.backgroundMusic) {
                  clearInterval(this.fadeInterval);
                  this.fadeInterval = null;
                  return;
              }
              
              volume = Math.min(volume + step, targetVolume);
              this.backgroundMusic.volume = volume;
              
              if (volume >= targetVolume) {
                  clearInterval(this.fadeInterval);
                  this.fadeInterval = null;
              }
          }, 100);
      } catch (err) {
          console.error("Error starting background music:", err);
          this.backgroundMusicStarted = false;
      }
  }
  
  // Forced unlock for audio on iOS/Safari
  forceAudioUnlock() {
      try {
          // Create a temporary audio context
          const tempContext = new (window.AudioContext || window.webkitAudioContext)();
          
          // Create a tiny sound and play it immediately
          const buffer = tempContext.createBuffer(1, 1, 22050);
          const source = tempContext.createBufferSource();
          source.buffer = buffer;
          source.connect(tempContext.destination);
          source.start(0);
          
          // Force resume our main context if it exists
          if (this.context && this.context.state === 'suspended') {
              this.context.resume();
          }
          
          // Force the background music to play
          if (this.backgroundMusic && this.backgroundMusic.paused && this.enabled) {
              const playPromise = this.backgroundMusic.play();
              if (playPromise) {
                  playPromise.catch(() => {
                      // Ignore errors, we're just trying to unlock
                  });
              }
          }
          
          console.log("Force audio unlock attempted");
      } catch (e) {
          console.warn("Force audio unlock failed:", e);
      }
  }
  
  // Disable sound system
  disable() {
      if (!this.enabled) return;
      
      console.log('Sound system disabled');
      
      // Clear any existing fade interval
      if (this.fadeInterval) {
          clearInterval(this.fadeInterval);
          this.fadeInterval = null;
      }
      
      // Fade out background music
      if (this.backgroundMusic && !this.backgroundMusic.paused) {
          const startVolume = this.backgroundMusic.volume;
          const step = 0.05;
          let volume = startVolume;
          
          this.fadeInterval = setInterval(() => {
              if (!this.backgroundMusic) {
                  clearInterval(this.fadeInterval);
                  this.fadeInterval = null;
                  return;
              }
              
              volume = Math.max(volume - step, 0);
              this.backgroundMusic.volume = volume;
              
              if (volume <= 0) {
                  this.backgroundMusic.pause();
                  this.backgroundMusic.currentTime = 0;
                  clearInterval(this.fadeInterval);
                  this.fadeInterval = null;
                  this.backgroundMusicStarted = false;
              }
          }, 50);
      }
      
      // Stop all other active sounds immediately
      for (const [id, instances] of Object.entries(this.soundInstances)) {
          instances.forEach(audio => {
              if (!audio.paused) {
                  audio.pause();
                  audio.currentTime = 0;
              }
          });
      }
      
      // Clear all throttle timeouts
      for (const timeout in this.throttles) {
          clearTimeout(this.throttles[timeout]);
          delete this.throttles[timeout];
      }
      
      this.enabled = false;
      
      // Reset blockers
      this.clickBlocker = false;
      this.sectionBlocker = false;
      
      // Update UI
      this.updateUI(false);
  }
  
  // Toggle sound system on/off
  toggle() {
      if (!this.initialized) this.init();
      
      if (this.enabled) {
          this.disable();
      } else {
          this.enable();
          
          // Force audio unlock
          this.forceAudioUnlock();
          
          // If toggling on and we're already past the landing page, start background music
          if (currentSection !== "landing") {
              this.startBackgroundMusic();
          }
      }
      
      return this.enabled;
  }
  
  // Simplified play function with better error handling and strict throttling
  play(id) {
      if (!this.enabled || !this.initialized) return false;
      
      try {
          // Special case handling for common sounds
          if (id === 'click') {
              if (this.clickBlocker) return false;
              
              // Set temporary blocker
              this.clickBlocker = true;
              setTimeout(() => {
                  this.clickBlocker = false;
              }, 300); // Prevent clicks for 300ms
              
          } else if (id === 'section') {
              if (this.sectionBlocker) return false;
              
              // Set temporary blocker
              this.sectionBlocker = true;
              setTimeout(() => {
                  this.sectionBlocker = false;
              }, 1000); // Prevent section sounds for 1 second
              
          } else if (id === 'hover') {
              // Simple time-based throttle for hover
              const now = Date.now();
              if (now - this.lastHoverTime < 300) return false;
              this.lastHoverTime = now;
          }
          
          // Check if the sound exists
          const sound = this.sounds[id];
          const instances = this.soundInstances[id];
          if (!sound || !instances || instances.length === 0) {
              console.warn(`Sound "${id}" not found or has no instances`);
              return false;
          }
          
          // Background music is handled separately
          if (id === 'background') return false;
          
          // Get the next instance in the rotation
          sound.currentInstance = (sound.currentInstance + 1) % instances.length;
          const audio = instances[sound.currentInstance];
          
          // Reset and play immediately
          audio.currentTime = 0;
          audio.volume = sound.config.volume;
          
          // Use timeout to separate different sound playback slightly
          setTimeout(() => {
              try {
                  const promise = audio.play();
                  if (promise !== undefined) {
                      promise.catch(e => {
                          if (e.name === 'NotAllowedError') {
                              // Try to unlock audio
                              this.forceAudioUnlock();
                          }
                      });
                  }
              } catch (e) {
                  console.warn(`Exception playing "${id}" sound:`, e);
              }
          }, id === 'click' ? 0 : 20); // Prioritize click sounds
          
          return true;
      } catch (err) {
          console.warn(`Failed to play sound ${id}:`, err);
          return false;
      }
  }
  
  // Update UI elements based on sound state
  updateUI(isEnabled) {
      const soundBtn = document.getElementById('sound-toggle');
      const soundIcon = document.getElementById('sound-icon');
      const audioEqualizer = document.getElementById('audio-equalizer');
      
      if (soundBtn) {
          soundBtn.classList.toggle('sound-on', isEnabled);
          soundBtn.setAttribute('aria-label', isEnabled ? 'Turn sound off' : 'Turn sound on');
      }
      
      if (soundIcon) {
          soundIcon.classList.remove(isEnabled ? 'fa-volume-mute' : 'fa-volume-up');
          soundIcon.classList.add(isEnabled ? 'fa-volume-up' : 'fa-volume-mute');
      }
      
      if (audioEqualizer) {
          audioEqualizer.classList.toggle('visible', isEnabled);
      }
  }
}

// Create global sound manager instance
const soundManager = new SoundManager();


function initBackgroundContainer() {
  // Check if container already exists to avoid duplicates
  if (document.getElementById('background-container')) return document.getElementById('background-container');
  
  // Create container with correct styles
  const bgContainer = document.createElement('div');
  bgContainer.id = 'background-container';
  bgContainer.style.position = 'fixed';
  bgContainer.style.top = '0';
  bgContainer.style.left = '0';
  bgContainer.style.width = '100vw';
  bgContainer.style.height = '100vh';
  bgContainer.style.zIndex = '-1'; // Ensure negative z-index
  document.body.appendChild(bgContainer);
  
  console.log('Background container initialized');
  return bgContainer;
}

// Loading animation
window.addEventListener('DOMContentLoaded', () => {
  // Initialize background container first
  const bgContainer = initBackgroundContainer();
  
  // Unlock audio context for mobile
  unlockAudioContext();
  forceIOSAudioUnlock();
  
  // Check device type
  const deviceInfo = detectDevice();
  isMobileDevice = deviceInfo.isMobile;

  // Fix section styles first for the new transition system
  sections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) {
          section.style.transition = 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
          section.style.background = 'transparent';
      }
  });
  
  // Add loading animation to grid items
  document.querySelectorAll('.grid-item').forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      item.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
  });
  
  // Trigger animation after sections are loaded
  setTimeout(() => {
      document.querySelectorAll('.grid-item').forEach((item) => {
          item.style.opacity = '1';
          item.style.transform = 'translateY(0)';
      });
  }, 500);
  
  // Initialize audio system
  soundManager.init();
  
  // Принудительно разблокируем аудио на iOS/Safari
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      document.addEventListener('touchstart', () => {
          if (soundManager) {
              soundManager.forceAudioUnlock();
          }
      }, { once: true });
  }
  
  // Set up swipe indicator for mobile
  const swipeIndicator = document.getElementById('swipe-indicator');
  if (swipeIndicator && isMobileDevice) {
      swipeIndicator.style.opacity = '0';
      setTimeout(() => {
          if (currentSection !== "landing") {
              swipeIndicator.style.opacity = '0.8';
              setTimeout(() => {
                  swipeIndicator.style.opacity = '0';
              }, 3000);
          }
      }, 2000);
  }
  
  // Try to initialize globe effect
  try {
      globeEffect = VANTA.GLOBE({
          el: document.getElementById("landing"),
          mouseControls: true,
          touchControls: true,
          gyroControls: true,
          minHeight: 200.00,
          minWidth: 200.00,
          scale: isMobileDevice ? 0.8 : 1.00,
          scaleMobile: 0.8,
          color: 0x878787,
          size: isMobileDevice ? 1.0 : 1.20,
          backgroundColor: 0x181818
      });
  } catch (err) {
      console.log("Globe effect init error:", err);
      document.getElementById("landing").style.background = "#181818";
  }
  
  // Initialize the shared background with magical dark blue/purple theme
  try {
      const bgContainer = document.getElementById('background-container');
      if (bgContainer) {
          // Adjust settings for mobile
          const cloudCover = isMobileDevice ? 0.15 : 0.25; // Уменьшение плотности для лучшей детализации
          const cloudHeight = isMobileDevice ? 0.35 : 0.45; // Увеличение высоты для большей объемности
          const initialSpeed = isMobileDevice ? 1.0 : 1.2;
          
          sharedCloudEffect = VANTA.CLOUDS({
              el: bgContainer,
              mouseControls: true,
              touchControls: true,
              gyroControls: true,
              minHeight: 200.00,
              minWidth: 200.00,
              skyColor: 0x121214,         // Темнее фон для лучшего контраста
              cloudColor: 0x383840,        // Более светлые и контрастные облака
              cloudShadowColor: 0x08080a,  // Более темные тени для контраста
              sunColor: 0x303035,          // Более контрастное солнце
              sunGlareColor: 0x454550,     // Усиленное свечение
              sunlightColor: 0x3d3d45,     // Более интенсивный свет
              speed: initialSpeed,         // Начальная скорость
              scale: isMobileDevice ? 1.0 : 1.2, // Увеличенный масштаб для большей детализации
              cloudCover: cloudCover,      // Уменьшенная плотность облаков
              cloudHeight: cloudHeight,    // Увеличенная высота облаков
              resolution: 30               // Увеличенное разрешение для большей четкости
          });
          
          // Храним начальные цвета и настройки для каждой секции
          window.cloudColors = {
              current: {
                  skyColor: 0x121214,
                  cloudColor: 0x383840,
                  cloudShadowColor: 0x08080a,
                  sunColor: 0x303035,
                  sunGlareColor: 0x454550,
                  sunlightColor: 0x3d3d45,
                  speed: initialSpeed,
                  scale: isMobileDevice ? 1.0 : 1.2
              },
              sections: [
                  // Intro - Серый с синим оттенком
                  {
                      skyColor: 0x121214, 
                      cloudColor: 0x383840, 
                      cloudShadowColor: 0x08080a,
                      sunColor: 0x303035,
                      sunGlareColor: 0x454550,
                      sunlightColor: 0x3d3d45,
                      speed: isMobileDevice ? 1.4 : 1.6,
                      scale: isMobileDevice ? 1.0 : 1.2
                  },
                  // Home - Серый с голубым оттенком
                  {
                      skyColor: 0x121216, 
                      cloudColor: 0x383844, 
                      cloudShadowColor: 0x08080c,
                      sunColor: 0x303038,
                      sunGlareColor: 0x454554,
                      sunlightColor: 0x3d3d48,
                      speed: isMobileDevice ? 1.6 : 1.8,
                      scale: isMobileDevice ? 1.05 : 1.25
                  },
                  // Work - Нейтральный серый
                  {
                      skyColor: 0x131313, 
                      cloudColor: 0x3a3a3a, 
                      cloudShadowColor: 0x090909,
                      sunColor: 0x323232,
                      sunGlareColor: 0x474747,
                      sunlightColor: 0x3f3f3f,
                      speed: isMobileDevice ? 1.8 : 2.0,
                      scale: isMobileDevice ? 1.1 : 1.3
                  },
                  // Stack - Серый с легким фиолетовым оттенком
                  {
                      skyColor: 0x131215, 
                      cloudColor: 0x3a3840, 
                      cloudShadowColor: 0x09080a,
                      sunColor: 0x323035,
                      sunGlareColor: 0x474550,
                      sunlightColor: 0x3f3d45,
                      speed: isMobileDevice ? 2.0 : 2.2,
                      scale: isMobileDevice ? 1.15 : 1.35
                  }, 
                  // Contact - Серый с теплым оттенком
                  {
                      skyColor: 0x151413, 
                      cloudColor: 0x3c3a38, 
                      cloudShadowColor: 0x0a0908,
                      sunColor: 0x343230,
                      sunGlareColor: 0x494745,
                      sunlightColor: 0x413f3d,
                      speed: isMobileDevice ? 2.2 : 2.4,
                      scale: isMobileDevice ? 1.2 : 1.4
                  }
              ]
          };
      }
  } catch (err) {
      console.log("Cloud effect init error:", err);
      document.body.style.background = "#121214"; // Запасной вариант
  }
  
  // Initialize sound button
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) {
      soundBtn.addEventListener('click', toggleSound);
  }
  
  // Add hover sounds to interactive elements
  addHoverSoundToElements();
  
  // Add mobile touch event handlers
  if (isMobileDevice) {
      setupTouchEvents();
  }
 
  // Set up collapsible grid items for mobile
  setupMobileGridItems();
  
  // Оптимизация позиционирования секций
  optimizePositioning();
  
  // После полной загрузки страницы, запускаем дополнительные оптимизации
  setTimeout(function() {
      // Делаем дополнительную попытку оптимизации позиционирования
      optimizePositioning();
      
      // Фиксируем видимость навигации
      document.querySelectorAll('.navigation').forEach(nav => {
          if (currentSection !== 'landing') {
              nav.classList.add('visible');
              nav.style.opacity = '1';
          }
      });
      
      // Добавляем обработчики для обеспечения стабильности звуков
      document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'visible' && soundManager.enabled) {
              // Попытка возобновить воспроизведение музыки при возвращении на страницу
              setTimeout(() => {
                  if (currentSection !== 'landing' && soundManager.enabled) {
                      soundManager.startBackgroundMusic();
                  }
              }, 300);
          }
      });
  }, 500);
});

// Initialize audio - redirected to SoundManager
function initAudio() {
  soundManager.init();
}

// Toggle sound system on/off
function toggleSound() {
  soundManager.toggle();
}

// Play a sound - улучшенная версия
function playSound(id) {
  if (!soundManager || !soundManager.enabled) return false;
  
  // Избегаем слишком частого воспроизведения одинаковых звуков
  const now = Date.now();
  
  // Специальная обработка для клика
  if (id === 'click') {
      // Глобальное ограничение
      if (now - window._lastClickSoundTime < 200) return false;
      window._lastClickSoundTime = now;
  }
  
  // Специальная обработка для смены секции
  if (id === 'section') {
      // Глобальное ограничение
      if (now - window._lastSectionSoundTime < 800) return false;
      window._lastSectionSoundTime = now;
  }
  
  return soundManager.play(id);
}

// Add hover sounds to interactive elements - упрощенная версия
function addHoverSoundToElements() {
  // Используем делегирование событий для оптимизации
  document.body.addEventListener('mouseover', (e) => {
      if (!soundManager || !soundManager.enabled) return;
      
      // Проверяем тип элемента
      if (e.target.matches && 
          (e.target.matches('.btn, .nav-dot, a') || 
           e.target.closest('.grid-item:not(.grid-item .grid-item), .btn, .nav-dot, a'))) {
          
          playSound('hover');
      }
  }, { passive: true });
  
  // Упрощенный обработчик для кликов
  document.body.addEventListener('click', (e) => {
      if (!soundManager || !soundManager.enabled) return;
      
      // Не воспроизводим звук клика для кнопки звука
      if (e.target.closest('#sound-toggle')) return;
      
      // Проверяем, является ли элемент кликабельным
      if (e.target.matches && 
          (e.target.matches('.btn, .nav-dot, a') || 
           e.target.closest('.btn, .nav-dot, a, .grid-item'))) {
          
          playSound('click');
      }
  }, { passive: true });
}

// Initialize Eye - improved with smoother blinking and mobile optimization
function Eye(canvas, x, y, scale, time) {
  this.canvas = canvas;
  this.context = this.canvas.getContext('2d');

  // Adjust scale for mobile devices
  if (isMobileDevice) {
      scale = scale * 0.7; // Reduce size on mobile for better performance
  }

  // The time at which this eye will come alive
  this.activationTime = time;

  // The speed at which the iris follows the mouse
  this.irisSpeed = 0.7 + (Math.random() * 0.2) / scale;

  // MODIFIED: Slower blinking speed for more natural effect
  this.blinkSpeed = 0.1 + (Math.random() * 0.09);  // Reduced from 0.12 + random*0.1
  this.blinkInterval = 4000 + 6000 * (Math.random()); // Less frequent blinking
  
  // Timestamp of the last blink
  this.blinkTime = Date.now();
  // Flag to track if a blink sound has played during the current blink
  this.blinkSoundPlayed = false;
  // Flag to prevent multiple forced blinks in succession
  this.isBlinking = false;

  this.scale = scale;
  this.size = 70 * scale;

  this.x = x * canvas.width;
  this.y = y * canvas.height + (this.size * 0.15);

  this.iris = {
      x: this.x,
      y: this.y - (this.size * 0.1),
      size: this.size * 0.2
  };

  this.pupil = {
      width: 2 * scale,
      height: this.iris.size * 0.75
  };

  this.exposure = {
      top: 0.1 + (Math.random() * 0.3),
      bottom: 0.5 + (Math.random() * 0.3),
      current: 0,
      target: 1
  };

  // Affects the amount of inner shadow
  this.tiredness = (0.5 - this.exposure.top) + 0.1;

  this.isActive = false;

  this.activate = function() {
      this.isActive = true;
      // Don't blink initially
      this.exposure.current = 1;
      this.exposure.target = 1;
  };
  
  // Force the eye to blink with smooth animation
  this.forceBlink = function() {
      // Prevent multiple blinks in succession
      if (this.isBlinking) return;
      
      this.isBlinking = true;
      this.exposure.target = 0;
      this.blinkTime = Date.now();
      this.blinkSoundPlayed = false;
      
      // Schedule opening the eye again with a longer duration for slower blinking
      setTimeout(() => {
          this.exposure.target = 1;
          
          // Reset the blinking flag after eye is fully opened
          setTimeout(() => {
              this.isBlinking = false;
          }, 1000); // Wait a bit longer to prevent rapid successive blinks
          
      }, 900); // Increased from 200ms for slower blink
  };

  // Listen for custom blink events
  this.canvas.addEventListener('blink', () => {
      this.forceBlink();
  });

  this.update = function(mouse) {
      if (this.isActive === true) {
          this.render(mouse);
      }
  };

  this.render = function(mouse) {
      var time = Date.now();

      if (this.exposure.current < 0.012) {
          this.exposure.target = 1;
      }
      else if (time - this.blinkTime > this.blinkInterval && !this.isBlinking) {
          this.isBlinking = true;
          this.exposure.target = 0;
          this.blinkTime = time;
          this.blinkSoundPlayed = false;
          
          // Schedule opening the eye again with smoother animation
          setTimeout(() => {
              this.exposure.target = 1;
              
              // Reset the blinking flag after eye is fully opened
              setTimeout(() => {
                  this.isBlinking = false;
              }, 400);
              
          }, 300); // Longer closure for slower blink
      }

      // Smoother easing for blinking
      const delta = this.exposure.target - this.exposure.current;
      this.exposure.current += delta * this.blinkSpeed;
      
      // Only play blink sound when eye is mostly closed (but only during forced blinks)
      // Only during the initial animation sequence to avoid random blinks making sounds
      if (!this.blinkSoundPlayed && this.exposure.current < 0.3 && 
          this.isBlinking && soundManager.enabled && 
          document.getElementById('eye-container').style.opacity === '1') {
          this.blinkSoundPlayed = true;
      }

      // Eye left/right
      var el = { x: this.x - (this.size * 0.8), y: this.y - (this.size * 0.1) };
      var er = { x: this.x + (this.size * 0.8), y: this.y - (this.size * 0.1) };

      // Eye top/bottom
      var et = { x: this.x, y: this.y - (this.size * (0.5 + (this.exposure.top * this.exposure.current))) };
      var eb = { x: this.x, y: this.y - (this.size * (0.5 - (this.exposure.bottom * this.exposure.current))) };

      // Eye inner shadow top
      var eit = { x: this.x, y: this.y - (this.size * (0.5 + ((0.5 - this.tiredness) * this.exposure.current))) };

      // Eye iris
      var ei = { x: this.x, y: this.y - (this.iris.size) };

      // Offset the iris depending on mouse position
      var eio = {
          x: (mouse.x / window.innerWidth) - 0.5,
          y: (mouse.y / window.innerHeight) - 0.5
      };

      // Apply the iris offset
      ei.x += eio.x * 16 * Math.max(1, this.scale * 0.4);
      ei.y += eio.y * 10 * Math.max(1, this.scale * 0.4);

      this.iris.x += (ei.x - this.iris.x) * this.irisSpeed;
      this.iris.y += (ei.y - this.iris.y) * this.irisSpeed;

      // Eye fill drawing
      this.context.fillStyle = 'rgba(255,255,255,1.0)';
      this.context.strokeStyle = 'rgba(100,100,100,1.0)';
      this.context.beginPath();
      this.context.lineWidth = 3;
      this.context.lineJoin = 'round';
      this.context.moveTo(el.x, el.y);
      this.context.quadraticCurveTo(et.x, et.y, er.x, er.y);
      this.context.quadraticCurveTo(eb.x, eb.y, el.x, el.y);
      this.context.closePath();
      this.context.stroke();
      this.context.fill();

      // Iris
      this.context.save();
      this.context.globalCompositeOperation = 'source-atop';
      this.context.translate(this.iris.x * 0.1, 0);
      this.context.scale(0.9, 1);
      this.context.strokeStyle = 'rgba(0,0,0,0.5)';
      this.context.fillStyle = 'rgba(20, 18, 29, 1)';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(this.iris.x, this.iris.y, this.iris.size, 0, Math.PI * 2, true);
      this.context.fill();
      this.context.stroke();
      this.context.restore();

      // Iris inner
      this.context.save();
      this.context.shadowColor = 'rgba(255,255,255,0.5)';
      this.context.shadowOffsetX = 0;
      this.context.shadowOffsetY = 0;
      this.context.shadowBlur = 2 * this.scale;
      this.context.globalCompositeOperation = 'source-atop';
      this.context.translate(this.iris.x * 0.1, 0);
      this.context.scale(0.9, 1);
      this.context.fillStyle = 'rgba(255,255,255,0.2)';
      this.context.beginPath();
      this.context.arc(this.iris.x, this.iris.y, this.iris.size * 0.7, 0, Math.PI * 2, true);
      this.context.fill();
      this.context.restore();

      // Pupil
      this.context.save();
      this.context.globalCompositeOperation = 'source-atop';
      this.context.fillStyle = 'rgba(0,0,0,0.9)';
      this.context.beginPath();
      this.context.moveTo(this.iris.x, this.iris.y - (this.pupil.height * 0.5));
      this.context.quadraticCurveTo(this.iris.x + (this.pupil.width * 0.5), this.iris.y, this.iris.x, this.iris.y + (this.pupil.height * 0.5));
      this.context.quadraticCurveTo(this.iris.x - (this.pupil.width * 0.5), this.iris.y, this.iris.x, this.iris.y - (this.pupil.height * 0.5));
      this.context.fill();
      this.context.restore();

      this.context.save();
      this.context.shadowColor = 'rgba(0,0,0,0.9)';
      this.context.shadowOffsetX = 0;
      this.context.shadowOffsetY = 0;
      this.context.shadowBlur = 10;

      // Eye top inner shadow
      this.context.fillStyle = 'rgba(120,120,120,0.2)';
      this.context.beginPath();
      this.context.moveTo(el.x, el.y);
      this.context.quadraticCurveTo(et.x, et.y, er.x, er.y);
      this.context.quadraticCurveTo(eit.x, eit.y, el.x, el.y);
      this.context.closePath();
      this.context.fill();

      this.context.restore();
  };
}

// Initialize eye animation with improved tracking and blinking
function initializeEye() {
  const eyeContainer = document.getElementById('eye-container');
  const fof = document.getElementById('fof');
  const canvas = fof.querySelector('canvas');
  
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const context = canvas.getContext('2d');
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  // Smoother mouse tracking
  let targetMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  
  // Track both mouse and touch for the eye
  const trackPointer = function(x, y) {
      targetMouse.x = x;
      targetMouse.y = y;
  };
  
  // Mouse tracking
  document.addEventListener('mousemove', function(event) {
      trackPointer(event.clientX, event.clientY);
  }, false);
  
  // Touch tracking
  document.addEventListener('touchmove', function(event) {
      if (event.touches.length > 0) {
          trackPointer(event.touches[0].clientX, event.touches[0].clientY);
          event.preventDefault(); // Prevent scrolling while tracking touch
      }
  }, { passive: false });

  // Create a larger, more prominently centered eye
  // For mobile, use a centered scale that works better on smaller screens
  const eyeScale = isMobileDevice ? 4.5 : 6.0; // Smaller on mobile but still prominent
  const eye = new Eye(canvas, 0.5, 0.5, eyeScale, 0);
  
  // Force the eye to activate immediately
  eye.activate();
  
  // Force an initial blink after a short delay
  setTimeout(() => {
      eye.forceBlink();
  }, 300);

  let animationId;
  function animate() {
      if (!canvas || !context) return;
      
      // Smooth mouse movement for more natural eye tracking
      mouse.x += (targetMouse.x - mouse.x) * 0.1;
      mouse.y += (targetMouse.y - mouse.y) * 0.1;
      
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      eye.update(mouse);
      animationId = requestAnimationFrame(animate);
  }

  animate();
  
  // Store references for cleanup
  eyeContainer.dataset.animationId = animationId;
  window.activeEye = eye;
}

// Update navigation dots
function updateNav() {
  const dots = document.querySelectorAll('.nav-dot');
  dots.forEach(dot => {
      if (dot.dataset.section === currentSection) {
          dot.classList.add('active');
      } else {
          dot.classList.remove('active');
      }
  });
}

// Функция для плавного перехода цветов с кубической интерполяцией
function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  
  return (r << 16) | (g << 8) | b;
}

// Функция для кубической интерполяции (плавное замедление)
function cubic(t) {
  return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Функция масштабирования облаков с плавным переходом
function animateCloudsZoom(targetScale) {
  if (!sharedCloudEffect) return;
  
  const startScale = sharedCloudEffect.options.scale;
  const duration = 2000; // 2 секунды
  const startTime = performance.now();
  
  function animate(currentTime) {
      if (!sharedCloudEffect) return;
      
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Функция плавности (кубическая)
      const ease = cubic(progress);
      
      // Интерполируем масштаб
      const newScale = startScale + (targetScale - startScale) * ease;
      
      try {
          // Обновляем настройки Vanta
          sharedCloudEffect.setOptions({ 
              scale: newScale
          });
      } catch (error) {
          console.error("Ошибка обновления масштаба облаков:", error);
      }
      
      if (progress < 1) {
          requestAnimationFrame(animate);
      }
  }
  
  requestAnimationFrame(animate);
}

// Mobile touch event handlers
function setupTouchEvents() {
  let touchStartY = 0;
  let touchStartX = 0;
  let touchEndY = 0;
  let touchEndX = 0;
  const minSwipeDistance = 50; // Minimum distance for swipe
  const swipeCooldown = 1000; // Cooldown between swipes to prevent accidental multi-swipes
  let lastSwipeTime = 0;
  
  // Общая обработка для всех устройств с сенсорным экраном
  const handleTouchStart = function(e) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
  };
  
  const handleTouchEnd = function(e) {
      // Don't process swipes during animation or on landing page
      if (isAnimating || currentSection === 'landing') return;
      
      // Check cooldown
      const now = Date.now();
      if (now - lastSwipeTime < swipeCooldown) return;
      
      touchEndY = e.changedTouches[0].clientY;
      touchEndX = e.changedTouches[0].clientX;
      
      // Вычисляем расстояние и направление свайпа
      const swipeDistanceY = touchEndY - touchStartY;
      const swipeDistanceX = touchEndX - touchStartX;
      
      // Определяем, был ли это вертикальный свайп (если по вертикали больше, чем по горизонтали)
      if (Math.abs(swipeDistanceY) > Math.abs(swipeDistanceX) && Math.abs(swipeDistanceY) > minSwipeDistance) {
          const direction = swipeDistanceY > 0 ? -1 : 1; // Swipe up means go to next section
          
          const currentIndex = sections.indexOf(currentSection);
          const newIndex = currentIndex + direction;
          
          if (newIndex >= 0 && newIndex < sections.length) {
              lastSwipeTime = now;
              changeSection(sections[newIndex]);
              
              // Show swipe indicator briefly after section change
              const swipeIndicator = document.getElementById('swipe-indicator');
              if (swipeIndicator) {
                  swipeIndicator.style.opacity = '0.8';
                  setTimeout(() => {
                      swipeIndicator.style.opacity = '0';
                  }, 1500);
              }
          }
      }
  };
  
  // Специфичные обработчики для разных устройств
  if (deviceInfo.isIOS) {
      // iOS использует специфичную обработку
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      // Предотвращение скролла на iOS (для секций без прокрутки)
      document.addEventListener('touchmove', function(e) {
          const currentSectionElem = document.getElementById(currentSection);
          
          // Если текущая секция имеет прокручиваемый контент и мы в нем,
          // позволяем стандартную прокрутку
          if (e.target.closest('.content-grid') && 
              currentSectionElem.scrollTop > 0 && 
              currentSectionElem.scrollTop + currentSectionElem.clientHeight < currentSectionElem.scrollHeight) {
              return;
          }
          
          // Для остальных случаев предотвращаем стандартное поведение
          if (currentSection !== 'landing' && !isAnimating) {
              e.preventDefault();
          }
      }, { passive: false });
  } else {
      // Общая обработка для других устройств
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      
      // Предотвращение нежелательной прокрутки
      document.addEventListener('touchmove', function(e) {
          const currentSectionElem = document.getElementById(currentSection);
          
          // If we're in a scrollable grid, allow scrolling
          if (e.target.closest('.content-grid')) {
              return;
          }
          
          // Otherwise, prevent default scrolling behavior
          if (currentSection !== 'landing' && !isAnimating) {
              e.preventDefault();
          }
      }, { passive: false });
  }
}

// Функция для правильного позиционирования на всех устройствах
function optimizePositioning() {
  // Получаем высоту вьюпорта и устройства
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const isPortrait = window.innerHeight > window.innerWidth;
  
  // Оптимизация для конкретных устройств
  const iOSSpecificOffset = deviceInfo.isIOS ? 5 : 0; // Дополнительный отступ для iOS
  const safariOffset = deviceInfo.isSafari ? 10 : 0; // Дополнительный отступ для Safari
  
  // Адаптация в зависимости от типа устройства
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => {
      const id = section.id;
      
      // Определяем базовый отступ сверху в зависимости от секции и устройства
      let topOffset;
      
      if (isPortrait) {
          // Портретная ориентация с учетом типа устройства
          if (id === 'landing') {
              topOffset = Math.min(vh * 0.3, 200) + iOSSpecificOffset;
          } else if (id === 'intro') {
              topOffset = Math.min(vh * 0.15, 120) + iOSSpecificOffset;
          } else if (id === 'contact') {
              topOffset = Math.min(vh * 0.1, 80) + iOSSpecificOffset;
          } else {
              // Остальные секции (home, work, stack)
              topOffset = Math.min(vh * 0.12, 100) + iOSSpecificOffset;
          }
          
          // Специфические настройки для браузеров
          if (deviceInfo.isSafari) {
              topOffset += safariOffset;
          }
          
          // Для очень маленьких экранов уменьшаем отступы
          if (vh < 700) {
              topOffset = Math.max(40, topOffset * 0.7);
          }
      } else {
          // Ландшафтная ориентация - специфичная для устройств
          if (deviceInfo.isMac) {
              // Для MacBook оставляем минимальный отступ сверху
              topOffset = 20;
          } else if (vw < 900) {
              // Мобильное устройство в ландшафте
              topOffset = 30 + (deviceInfo.isIOS ? iOSSpecificOffset : 0);
          } else {
              // Десктоп или планшет в ландшафте
              topOffset = 0; // Центрирование по умолчанию
          }
      }
      
      // Применяем отступ, если он был рассчитан
      if (topOffset > 0) {
          section.style.justifyContent = 'flex-start';
          section.style.paddingTop = `${topOffset}px`;
      } else {
          section.style.justifyContent = 'center';
          section.style.paddingTop = '0';
      }
  });
  
  // Проверка на специфические устройства
  if (deviceInfo.isIOS || deviceInfo.isSafari) {
      // Исправление отображения на устройствах Apple
      document.querySelectorAll('.content-grid').forEach(grid => {
          grid.style.webkitOverflowScrolling = 'touch'; // Улучшение прокрутки на iOS
      });
  }
}



function optimizeForPerformance() {
  // Определяем категорию производительности устройства
  let performanceCategory = 'high';
  
  // Определяем по характеристикам устройства
  if (deviceInfo.isMobile) {
      performanceCategory = 'low';
  } else if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
      performanceCategory = 'medium';
  }
  
  // Применяем оптимизации в зависимости от категории
  if (performanceCategory === 'low') {
      // Для слабых устройств
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({
              resolution: 20,
              scale: 0.8,
              cloudCover: 0.15
          });
      }
  } else if (performanceCategory === 'medium') {
      // Для средних устройств
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({
              resolution: 25,
              scale: 1.0
          });
      }
  } else {
      // Для мощных устройств - максимальное качество
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({
              resolution: 35,
              scale: 1.2
          });
      }
  }
  
  console.log(`Performance optimization applied: ${performanceCategory} category`);
}

// Вызвать в конце инициализации
optimizeForPerformance();



function checkBrowserCompatibility() {
  const warnings = [];
  
  // Проверяем основные API
  if (!window.requestAnimationFrame) warnings.push('requestAnimationFrame');
  if (!window.localStorage) warnings.push('localStorage');
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') {
      warnings.push('AudioContext');
  }
  
  // Если есть предупреждения, показываем их в консоли
  if (warnings.length > 0) {
      console.warn(`Browser compatibility issues detected: ${warnings.join(', ')}`);
      
      // Применяем запасные варианты
      if (warnings.includes('requestAnimationFrame')) {
          // Полифилл уже добавлен в коде
          console.log('Using requestAnimFrame polyfill');
      }
      
      if (warnings.includes('AudioContext')) {
          // Отключаем звуки если API аудио недоступен
          console.log('Audio disabled due to missing AudioContext support');
          soundManager.enabled = false;
      }
  }
}

// Вызвать в начале инициализации
checkBrowserCompatibility();

// Change section with transition effects - enhanced with color transitions
function changeSection(newSection) {
  if (isAnimating || newSection === currentSection) return;
  isAnimating = true;

  // Скрываем/показываем навигацию
  const navigation = document.querySelector('.navigation');
  if (navigation) {
      if (newSection === 'landing') {
          navigation.classList.remove('visible');
      } else if (currentSection === 'landing') {
          navigation.classList.add('visible');
      }
  }

  // Воспроизведение звука перехода ТОЛЬКО ОДИН РАЗ!
  if (soundManager && soundManager.enabled) {
      playSound('section');
  }

  // В начале функции changeSection
  if (newSection === 'landing') {
      const navigation = document.querySelector('.navigation');
      if (navigation) {
          navigation.classList.add('hidden');
      }
  }

  // Start background music if moving to a main section for the first time
  if (currentSection === "landing" && soundManager.enabled) {
      soundManager.startBackgroundMusic();
  }

  const oldSection = document.getElementById(currentSection);
  const nextSection = document.getElementById(newSection);
  
  // Получаем индексы для определения направления перехода
  const currentIndex = sections.indexOf(currentSection);
  const newIndex = sections.indexOf(newSection);
  const direction = newIndex > currentIndex ? 1 : -1;
  
  // Запускаем переход цветов для облаков
  if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function' && window.cloudColors) {
      try {
          // Ускоряем облака во время перехода для более заметного эффекта
          sharedCloudEffect.setOptions({ speed: isMobileDevice ? 2.0 : 2.5 });
          
          // Получаем цвета для текущей и следующей секций
          const currentColors = window.cloudColors.sections[currentIndex];
          const nextColors = window.cloudColors.sections[newIndex];
          
          // Плавный переход между цветами
          const startTime = Date.now();
          const transitionDuration = 1200; // 1.2 секунды

          setTimeout(() => {
              // Setup mobile grid items in the new section
              setupMobileGridItems();
              isAnimating = false;
          }, 1200);
          
          function updateCloudColors() {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / transitionDuration, 1);
              // Используем кубическую интерполяцию для плавности
              const easeProgress = cubic(progress);
              
              // Примененяем новые цвета с плавным переходом
              sharedCloudEffect.setOptions({
                  skyColor: lerpColor(currentColors.skyColor, nextColors.skyColor, easeProgress),
                  cloudColor: lerpColor(currentColors.cloudColor, nextColors.cloudColor, easeProgress),
                  cloudShadowColor: lerpColor(currentColors.cloudShadowColor, nextColors.cloudShadowColor, easeProgress),
                  sunColor: lerpColor(currentColors.sunColor, nextColors.sunColor, easeProgress),
                  sunGlareColor: lerpColor(currentColors.sunGlareColor, nextColors.sunGlareColor, easeProgress),
                  sunlightColor: lerpColor(currentColors.sunlightColor, nextColors.sunlightColor, easeProgress),
                  speed: currentColors.speed + (nextColors.speed - currentColors.speed) * easeProgress,
                  scale: currentColors.scale + (nextColors.scale - currentColors.scale) * easeProgress
              });
              
              // Обновляем текущие цвета
              window.cloudColors.current = {
                  skyColor: lerpColor(currentColors.skyColor, nextColors.skyColor),
                  skyColor: lerpColor(currentColors.skyColor, nextColors.skyColor, easeProgress),
                  cloudColor: lerpColor(currentColors.cloudColor, nextColors.cloudColor, easeProgress),
                  cloudShadowColor: lerpColor(currentColors.cloudShadowColor, nextColors.cloudShadowColor, easeProgress),
                  sunColor: lerpColor(currentColors.sunColor, nextColors.sunColor, easeProgress),
                  sunGlareColor: lerpColor(currentColors.sunGlareColor, nextColors.sunGlareColor, easeProgress),
                  sunlightColor: lerpColor(currentColors.sunlightColor, nextColors.sunlightColor, easeProgress),
                  speed: currentColors.speed + (nextColors.speed - currentColors.speed) * easeProgress,
                  scale: currentColors.scale + (nextColors.scale - currentColors.scale) * easeProgress
              };
              
              if (progress < 1) {
                  requestAnimationFrame(updateCloudColors);
              } else {
                  // Сбрасываем скорость облаков после завершения перехода
                  setTimeout(() => {
                      sharedCloudEffect.setOptions({ speed: nextColors.speed });
                  }, 400);
              }
          }
          
          updateCloudColors();
          
      } catch (err) {
          console.log("Could not update cloud colors:", err);
      }
  }
  
  // Создаем эффект затемнения при переходе
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0)';
  overlay.style.zIndex = '140';
  overlay.style.pointerEvents = 'none';
  overlay.style.transition = 'background-color 0.5s cubic-bezier(0.65, 0, 0.35, 1)';
  document.body.appendChild(overlay);
  
  // Применяем легкое затемнение
  requestAnimationFrame(() => {
      overlay.style.backgroundColor = 'rgba(0,0,0,0.2)';
  });

  // Используем более плавный переход между секциями
  // Adjusted transition values for mobile
  const transitionOffset = isMobileDevice ? '20%' : '30%'; 

  if (direction > 0) {
      // Движение вперед: текущая уходит вверх, следующая приходит снизу
      oldSection.style.transform = `translateY(-${transitionOffset})`;
      oldSection.style.opacity = '0';
      
      setTimeout(() => {
          nextSection.classList.remove('hidden');
          nextSection.style.transform = `translateY(${transitionOffset})`;
          nextSection.style.opacity = '0';
          
          requestAnimationFrame(() => {
              nextSection.style.transition = 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
              nextSection.style.transform = 'translateY(0)';
              nextSection.style.opacity = '1';
          });
      }, 300);
  } else {
      // Движение назад: текущая уходит вниз, следующая приходит сверху
      oldSection.style.transform = `translateY(${transitionOffset})`;
      oldSection.style.opacity = '0';
      
      setTimeout(() => {
          nextSection.classList.remove('hidden');
          nextSection.style.transform = `translateY(-${transitionOffset})`;
          nextSection.style.opacity = '0';
          
          requestAnimationFrame(() => {
              nextSection.style.transition = 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
              nextSection.style.transform = 'translateY(0)';
              nextSection.style.opacity = '1';
          });
      }, 300);
  }
  
  // Завершаем переход
  setTimeout(() => {
      // Убираем затемнение
      overlay.style.backgroundColor = 'rgba(0,0,0,0)';
      
      // Удаляем оверлей после перехода
      setTimeout(() => {
          if (document.body.contains(overlay)) {
              document.body.removeChild(overlay);
          }
      }, 500);
      
      // Сбрасываем старую секцию и устанавливаем новую текущую секцию
      oldSection.classList.add('hidden');
      oldSection.classList.remove('active');
      oldSection.style.transform = '';
      oldSection.style.opacity = '';
      oldSection.style.transition = '';
      
      nextSection.classList.add('active');
      nextSection.classList.remove('hidden');
      
      currentSection = newSection;
      updateNav();
      
      // Show swipe indicator on mobile if not on the landing page
      if (isMobileDevice && currentSection !== "landing") {
          showSwipeIndicator();
      }
      
      // Оптимизируем позиционирование после смены секции
      setTimeout(() => {
          optimizePositioning();
      }, 100);
      
      isAnimating = false;
  }, 1100);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && currentSection === 'landing') {
      enterSite();
  }
});

// Animation to darken screen and show eye - improved with single focused blink
function enterSite() {
  console.log("Enter site function called");
  
  // Дополнительная проверка
  if (currentSection !== 'landing') {
      console.log("Not on landing page, ignoring enter");
      return;
  }
  
  if (isAnimating) return;
  isAnimating = true;
  
  // Принудительно разблокируем аудио на iOS
  forceIOSAudioUnlock();
  
  // Включаем звук с небольшой задержкой для мобильных устройств
  setTimeout(() => {
      soundManager.enable();
      
      // Сразу играем звук клика для разблокировки аудиосистемы
      playSound('click');
  }, isMobileDevice ? 50 : 0);
  
  // Show sound toggle button
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) {
      soundBtn.classList.add('visible');
  }
  
  // Show audio visualizer
  const audioEqualizer = document.getElementById('audio-equalizer');
  if (audioEqualizer) {
      audioEqualizer.classList.add('visible');
  }
  
  // Show ambient pulse
  const ambientPulse = document.getElementById('ambient-pulse');
  if (ambientPulse) {
      ambientPulse.classList.add('active');
  }

  const overlay = document.getElementById('overlay');
  const eyeContainer = document.getElementById('eye-container');
  const landing = document.getElementById('landing');

  // Инициализируем глаз
  initializeEye();

  // Первый эффект масштабирования
  landing.style.transform = 'scale(1.1)';
  
  // Добавляем масштабирование облаков
  animateCloudsZoom(isMobileDevice ? 1.2 : 1.5);
  
  // Затемняем экран
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'auto';

  setTimeout(() => {
      // Сразу скрываем landing, но он останется за overlay
      landing.style.opacity = '0';
      landing.style.transition = 'opacity 0.6s ease';
      
      // Показываем контейнер глаза
      eyeContainer.style.display = 'block';
      requestAnimationFrame(() => {
          eyeContainer.style.opacity = '1';
          
          // Ждем и показываем глаз на момент без моргания
          setTimeout(() => {
              // Play blink sound exactly once during the critical animation moment
              if (soundManager.enabled) {
                  playSound('blink');
              }
              
              // Trigger the eye blink
              if (window.activeEye) {
                  window.activeEye.forceBlink();
              }
              
              // Ждем завершения моргания - увеличенное время для медленного моргания
              setTimeout(() => {
                  // Скрываем глаз
                  eyeContainer.style.opacity = '0';
                  
                  setTimeout(() => {
                      // Полностью скрываем контейнер глаза
                      eyeContainer.style.display = 'none';
                  
                      // Полностью скрываем landing (если еще не скрыт)
                      landing.classList.add('hidden');
                      landing.classList.remove('active');
                      landing.style.transform = 'translateY(-30%)';
                      
                      // Подготавливаем intro секцию
                      const introSection = document.getElementById('intro');
                      introSection.classList.remove('hidden');
                      introSection.style.transform = 'translateY(30%)';
                      introSection.style.opacity = '0';
                      
                      // Осветляем экран (это покажет intro)
                      overlay.style.opacity = '0';
                      overlay.style.pointerEvents = 'none';
                      
                      // Play section change sound
                      playSound('section');
                      
                      // Показываем переключатель языка и навигацию
                      document.querySelectorAll('.navigation').forEach(nav => {
                          nav.classList.add('visible');
                      });
                      
                      const langToggle = document.querySelector('.language-toggle');
                      if (langToggle) {
                          langToggle.classList.add('visible');
                      }
                      
                      // Show swipe indicator on mobile
                      if (isMobileDevice) {
                          const swipeIndicator = document.getElementById('swipe-indicator');
                          if (swipeIndicator) {
                              setTimeout(() => {
                                  swipeIndicator.style.opacity = '0.8';
                                  setTimeout(() => {
                                      swipeIndicator.style.opacity = '0';
                                  }, 3000);
                              }, 1500);
                          }
                      }
                      
                      // Плавная анимация появления снизу
                      requestAnimationFrame(() => {
                          introSection.style.transition = 'transform 0.8s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.8s cubic-bezier(0.19, 1, 0.22, 1)';
                          introSection.style.transform = 'translateY(0)';
                          introSection.style.opacity = '1';
                          
                          setTimeout(() => {
                              introSection.classList.add('active');
                              
                              // Обновляем навигацию
                              currentSection = 'intro';
                              updateNav();
                              
                              // Уничтожаем эффект глобуса
                              try {
                                  if (globeEffect && typeof globeEffect.destroy === 'function') {
                                      globeEffect.destroy();
                                  }
                              } catch (err) {
                                  console.log("Error destroying globe effect:", err);
                              }
                              
                              // Start background music when moving to intro section
                              if (soundManager.enabled) {
                                  soundManager.startBackgroundMusic();
                              }
                              
                              // Применяем оптимизированное позиционирование
                              optimizePositioning();
                              
                              isAnimating = false;
                          }, 800);
                      });
                  }, 600);
              }, isMobileDevice ? 3000 : 3400);
          }, 800);
      });
  }, 500);
}

// Класс для управления языком сайта
class LanguageManager {
  constructor() {
      this.currentLang = localStorage.getItem('preferredLanguage') || 'en';
      this.translations = {
          en: {
              // Landing page
              landingTitle: "Aziz Karatay",
              landingSubtitle: "FullStack Developer",
              enterBtn: "Enter",
              
              // Intro section
              introTitle: "Aziz Karatay",
              introBio1: "Hey! I'm a full-stack developer who loves crafting digital solutions. From slick user interfaces to robust backend systems — I bring ideas to life with code that's both elegant and practical.",
              introBio2: "The main thing in my work is the result. I can understand someone else's code, find a problem and offer a solution. It is important for me not just to do it, but to do it in such a way that I don't have to redo it later.",
              
              // Home section
              homeTitle: "About Me",
              homeDev: "Web Development",
              homeDevItem1: "From simple sites to complex web apps",
              homeDevItem2: "Making slow sites lightning fast",
              homeDevItem3: "Interfaces that look great on any device",
              homeTg: "Telegram Bots",
              homeTgItem1: "Smart bots with payments and subscriptions",
              homeTgItem2: "Crypto integration and wallet features",
              homeTgItem3: "Rock-solid infrastructure that never sleeps",
              homeDevOps: "DevOps & Server-side",
              homeDevOpsItem1: "Containerization and cloud deployment",
              homeDevOpsItem2: "Automated pipelines that save time",
              homeDevOpsItem3: "Bulletproof backup and monitoring",
              homeOpt: "Speed & Security",
              homeOptItem1: "Turbocharging websites with smart caching",
              homeOptItem2: "Keeping the bad guys out of your systems",
              homeOptItem3: "Finding and fixing performance bottlenecks",
              
              // Work section
              workTitle: "What I Work With",
              workAuto: "Process Automation",
              workAutoItem1: "Connecting systems that weren't meant to talk",
              workAutoItem2: "Building scrapers and scheduled tasks",
              workAutoItem3: "Taming unruly data into useful structures",
              workFull: "Full Service",
              workFullItem1: "Taking your idea from sketch to launch",
              workFullItem2: "Keeping your project up and running",
              workFullItem3: "Squeezing every bit of performance",
              workCustom: "Custom Solutions",
              workCustomItem1: "Software that fits your business like a glove",
              workCustomItem2: "Interfaces that make users go wow",
              workCustomItem3: "Features you won't find off-the-shelf",
              workConsult: "Consulting",
              workConsultItem1: "Untangling technical messes",
              workConsultItem2: "Making slow systems run like new",
              workConsultItem3: "Finding security holes before hackers do",
              
              // Stack section - оставляем технические термины без изменений
              stackTitle: "My Tech Stack",
              stackFront: "Frontend",
              stackFrontItem1: "HTML5 / CSS3 / JavaScript (ES6+)",
              stackFrontItem2: "Blender",
              stackFrontItem3: "Tailwind CSS, Framer Motion",
              stackFrontItem4: "Animations, Three.js",
              stackBack: "Backend",
              stackBackItem1: "Python (FastAPI, aiogram, asyncio)",
              stackBackItem2: "Node.js (Telegram API)",
              stackBackItem3: "PHP (Laravel, Slim)",
              stackDB: "Databases",
              stackDBItem1: "PostgreSQL / MySQL / SQLite",
              stackDBItem2: "ORM: SQLAlchemy",
              stackDevOps: "DevOps",
              stackDevOpsItem1: "Linux (Ubuntu)",
              stackDevOpsItem2: "Docker / Docker Compose",
              stackDevOpsItem3: "Nginx ",
              stackDevOpsItem4: "Cloudflare, SSL",
              stackAPI: "API / Integrations",
              stackAPIItem1: "REST API, Webhooks",
              stackAPIItem2: "Telegram Bot API, Crypto Bot",
              stackAPIItem3: "Payment gateways: Crypto Bot, Binance, TON",
              stackOther: "Other",
              stackOtherItem1: "Git / GitHub ",
              stackOtherItem2: "CI/CD (GitHub Actions)",
              stackOtherItem3: "Figma, Photoshop",
              
              // Contact section
              contactTitle: "Get In Touch",
              contactText: "Got a project in mind? Let's chat about how to make it happen. No technical jargon, just straight talk about bringing your ideas to life.",
              contactTelegram: "Telegram:",
              contactEmail: "Email:", 
              
              // Swipe indicator
              swipeText: "Swipe to navigate",
              
              // Nav tooltips
              navIntro: "Intro",
              navAbout: "About",
              navWork: "Work",
              navStack: "Stack",
              navContact: "Contact"
          },
          ru: {
              // Landing page
              landingTitle: "Aziz Karatay",
              landingSubtitle: "Full-stack developer",
              enterBtn: "Enter",
              
              // Intro section
              introTitle: "Азиз Каратай",
              introBio1: "Привет! Я фулстек-разработчик, который создаёт прекрасные проекты. От стильных интерфейсов до мощных бэкенд-систем — я воплощаю идеи в код, который одновременно элегантен и практичен.",
              introBio2: "Главное в моей работе — результат. Могу разобраться в чужом коде, найти проблему и предложить решение. Для меня важно не просто сделать, а сделать так, чтобы потом не переделывать.",
              
              // Home section
              homeTitle: "Обо мне",
              homeDev: "Веб-разработка",
              homeDevItem1: "От простых сайтов до сложных веб-приложений",
              homeDevItem2: "Делаю медленные сайты молниеносно быстрыми",
              homeDevItem3: "Интерфейсы, которые отлично смотрятся везде",
              homeTg: "Телеграм боты",
              homeTgItem1: "Умные боты с платежами и подписками",
              homeTgItem2: "Крипто-интеграция и функции кошелька",
              homeTgItem3: "Надежные сервера, работающая 24/7",
              homeDevOps: "DevOps и серверная часть",
              homeDevOpsItem1: "Контейнеризация и облачные развертывания",
              homeDevOpsItem2: "Автоматизация, экономящая ваше время",
              homeDevOpsItem3: "Надежное резервирование и мониторинг",
              homeOpt: "Скорость и безопасность",
              homeOptItem1: "Ускорение сайтов с умным кэшированием",
              homeOptItem2: "Защита ваших систем от злоумышленников",
              homeOptItem3: "Поиск и устранение плохой производительности",
              
              // Work section
              workTitle: "С чем я работаю",
              workAuto: "Автоматизация процессов",
              workAutoItem1: "Соединяю системы, не предназначенные для общения",
              workAutoItem2: "Создаю парсеры и планировщики задач",
              workAutoItem3: "Превращаю хаотичные данные в полезные структуры",
              workFull: "Полный сервис",
              workFullItem1: "Провожу вашу идею от наброска до запуска",
              workFullItem2: "Поддерживаю ваш проект в рабочем состоянии",
              workFullItem3: "Выжимаю максимум производительности",
              workCustom: "Индивидуальные решения",
              workCustomItem1: "Софт, который подходит идеально для вашего бизнеса",
              workCustomItem2: "Интерфейсы, от которых пользователи в восторге",
              workCustomItem3: "Функции, которых нет в готовых решениях",
              workConsult: "Консультации",
              workConsultItem1: "Распутываю технические проблемы",
              workConsultItem2: "Заставляю медленные системы работать как новые",
              workConsultItem3: "Нахожу уязвимости до того, как их найдут хакеры",
              
              // Stack section - технические термины также оставляем без изменений
              stackTitle: "Технический стек",
              stackFront: "Фронтенд",
              stackFrontItem1: "HTML5 / CSS3 / JavaScript (ES6+)",
              stackFrontItem2: "Blender",
              stackFrontItem3: "Tailwind CSS, Framer Motion",
              stackFrontItem4: "Анимации,Three.js",
              stackBack: "Бэкенд",
              stackBackItem1: "Python (FastAPI, aiogram, asyncio)",
              stackBackItem2: "Node.js (Telegram API)",
              stackBackItem3: "PHP (Laravel, Slim)",
              stackDB: "Базы данных",
              stackDBItem1: "PostgreSQL / MySQL / SQLite",
              stackDBItem2: "ORM: SQLAlchemy",
              stackDevOps: "DevOps",
              stackDevOpsItem1: "Linux (Ubuntu)",
              stackDevOpsItem2: "Docker / Docker Compose",
              stackDevOpsItem3: "Nginx",
              stackDevOpsItem4: "Cloudflare, SSL",
              stackAPI: "API / Интеграции",
              stackAPIItem1: "REST API, Webhooks",
              stackAPIItem2: "Telegram Bot API, Crypto Bot",
              stackAPIItem3: "Платежные системы: CryptoBot, Binance, TON",
              stackOther: "Другое",
              stackOtherItem1: "Git / GitHub",
              stackOtherItem2: "CI/CD (GitHub Actions)",
              stackOtherItem3: "Figma, Photoshop",
              
              // Contact section
              contactTitle: "Связь",
              contactText: "Есть проект на примете? Давайте обсудим, как воплотить его в жизнь.И реализуем все ваши идеи.",
              contactTelegram: "Telegram:",
              contactEmail: "Email:", 
              
              // Swipe indicator
              swipeText: "Свайп для навигации",
              
              // Nav tooltips
              navIntro: "Интро",
              navAbout: "Обо мне",
              navWork: "Работа",
              navStack: "Стек",
              navContact: "Контакт"
          }
      };
      
      // Initialize language buttons
      this.initLangButtons();
  }
  
  // Функция для применения стилей шрифта в зависимости от языка
  applyFontStyles(lang) {
      // Если выбран русский язык, применяем другой шрифт
      if (lang === 'ru') {
          // Добавляем стили напрямую в head
          let styleElement = document.getElementById('ru-font-style');
          if (!styleElement) {
              styleElement = document.createElement('style');
              styleElement.id = 'ru-font-style';
              document.head.appendChild(styleElement);
          }
          
          // Применяем более жирный шрифт для русского текста
          styleElement.textContent = `
              h1, h2, h3, p, li, a, button, span, .lang-option {
                  font-weight: 600 !important;
                  letter-spacing: 0.03em !important;
              }
              
              .nav-tooltip, #swipe-indicator span {
                  font-weight: 600 !important;
              }
              
              .grid-item h3, .grid-item li {
                  font-weight: 600 !important;
              }
          `;
      } else {
          // Если не русский язык, удаляем стили
          const styleElement = document.getElementById('ru-font-style');
          if (styleElement) {
              styleElement.remove();
          }
      }
  }

  // Метод переключения языка с применением стилей
  switchLanguage(lang) {
      if (lang === this.currentLang) return;
      
      this.currentLang = lang;
      localStorage.setItem('preferredLanguage', lang);
      this.applyLanguage(lang);
      this.applyFontStyles(lang);
  }

  // Исправленная инициализация кнопок языка
  initLangButtons() {
      // Обновляем индикатор активного языка
      const langSlider = document.querySelector('.language-slider');
      if (langSlider) {
          langSlider.setAttribute('data-active', this.currentLang);
      }
      
      // Удаляем старые обработчики событий, чтобы избежать дублирования
      const langOptions = document.querySelectorAll('.lang-option');
      langOptions.forEach(btn => {
          // Клонируем элементы для удаления всех обработчиков
          const newBtn = btn.cloneNode(true);
          if (btn.parentNode) {
              btn.parentNode.replaceChild(newBtn, btn);
          }
      });
      
      // Заново находим клонированные элементы
      const newLangOptions = document.querySelectorAll('.lang-option');
      
      // Устанавливаем активный класс для текущего языка
      newLangOptions.forEach(btn => {
          if (btn.dataset.lang === this.currentLang) {
              btn.classList.add('active');
          }
          
          // Добавляем единственный обработчик клика
          btn.addEventListener('click', (e) => {
              e.stopPropagation(); // Останавливаем всплытие события
              
              if (btn.dataset.lang !== this.currentLang) {
                  // Воспроизводим звук клика только один раз
                  if (soundManager && soundManager.enabled) {
                      setTimeout(() => {
                          playSound('click');
                      }, 10);
                  }
                  
                  // Обновляем активный класс
                  newLangOptions.forEach(b => b.classList.remove('active'));
                  btn.classList.add('active');
                  
                  // Перемещаем индикатор
                  if (langSlider) {
                      langSlider.setAttribute('data-active', btn.dataset.lang);
                  }
                  
                  // Переключаем язык
                  this.switchLanguage(btn.dataset.lang);
              }
          });
      });
      
      // Apply initial language
      this.applyLanguage(this.currentLang);
  }
  
  // Apply language to all elements
  applyLanguage(lang) {
      const texts = this.translations[lang];
      if (!texts) return;
      
      // Устанавливаем язык для всего документа
      document.documentElement.setAttribute('lang', lang);
      
      // Landing page
      this.updateTextContent('#landing h1', texts.landingTitle);
      this.updateTextContent('#landing h2', texts.landingSubtitle);
      this.updateTextContent('#enter-btn', `<i class="fas fa-arrow-right"></i> ${texts.enterBtn}`);
      
      // Intro section
      this.updateTextContent('#intro h1', `<i class="fas fa-code-branch"></i> ${texts.introTitle}`);
      this.updateTextContent('#intro .bio p:nth-child(1)', `<i class="fas fa-laptop-code"></i> ${texts.introBio1}`);
      this.updateTextContent('#intro .bio p:nth-child(2)', `<i class="fas fa-lightbulb"></i> ${texts.introBio2}`);
      
      // Home section
      this.updateTextContent('#home h2', `<i class="fas fa-user-circle"></i> ${texts.homeTitle}`);
      this.updateTextContent('#home .grid-item:nth-child(1) h3', `<i class="fas fa-code"></i> ${texts.homeDev}`);
      this.updateTextContent('#home .grid-item:nth-child(1) li:nth-child(1)', texts.homeDevItem1);
      this.updateTextContent('#home .grid-item:nth-child(1) li:nth-child(2)', texts.homeDevItem2);
      this.updateTextContent('#home .grid-item:nth-child(1) li:nth-child(3)', texts.homeDevItem3);
      this.updateTextContent('#home .grid-item:nth-child(2) h3', `<i class="fab fa-telegram-plane"></i> ${texts.homeTg}`);
      this.updateTextContent('#home .grid-item:nth-child(2) li:nth-child(1)', texts.homeTgItem1);
      this.updateTextContent('#home .grid-item:nth-child(2) li:nth-child(2)', texts.homeTgItem2);
      this.updateTextContent('#home .grid-item:nth-child(2) li:nth-child(3)', texts.homeTgItem3);
      this.updateTextContent('#home .grid-item:nth-child(3) h3', `<i class="fas fa-server"></i> ${texts.homeDevOps}`);
      this.updateTextContent('#home .grid-item:nth-child(3) li:nth-child(1)', texts.homeDevOpsItem1);
      this.updateTextContent('#contact .contact p:nth-child(1)', `<i class="fab fa-telegram"></i> ${texts.contactTelegram} <a href="https://t.me/Nikorizz" target="_blank">@Nikorizz</a>`);
      this.updateTextContent('#contact .contact p:nth-child(2)', `<i class="fas fa-envelope"></i> ${texts.contactEmail} <a href="mailto:NikorizzWork@gmail.com" target="_blank">NikorizzWork@gmail.com</a>`);
      this.updateTextContent('#home .grid-item:nth-child(3) li:nth-child(2)', texts.homeDevOpsItem2);
      this.updateTextContent('#home .grid-item:nth-child(3) li:nth-child(3)', texts.homeDevOpsItem3);
      this.updateTextContent('#home .grid-item:nth-child(4) h3', `<i class="fas fa-tachometer-alt"></i> ${texts.homeOpt}`);
      this.updateTextContent('#home .grid-item:nth-child(4) li:nth-child(1)', texts.homeOptItem1);
      this.updateTextContent('#home .grid-item:nth-child(4) li:nth-child(2)', texts.homeOptItem2);
      this.updateTextContent('#home .grid-item:nth-child(4) li:nth-child(3)', texts.homeOptItem3);
      
      // Work section
      this.updateTextContent('#work h2', `<i class="fas fa-briefcase"></i> ${texts.workTitle}`);
      this.updateTextContent('#work .grid-item:nth-child(1) h3', `<i class="fas fa-robot"></i> ${texts.workAuto}`);
      this.updateTextContent('#work .grid-item:nth-child(1) li:nth-child(1)', texts.workAutoItem1);
      this.updateTextContent('#work .grid-item:nth-child(1) li:nth-child(2)', texts.workAutoItem2);
      this.updateTextContent('#work .grid-item:nth-child(1) li:nth-child(3)', texts.workAutoItem3);
      this.updateTextContent('#work .grid-item:nth-child(2) h3', `<i class="fas fa-cogs"></i> ${texts.workFull}`);
      this.updateTextContent('#work .grid-item:nth-child(2) li:nth-child(1)', texts.workFullItem1);
      this.updateTextContent('#work .grid-item:nth-child(2) li:nth-child(2)', texts.workFullItem2);
      this.updateTextContent('#work .grid-item:nth-child(2) li:nth-child(3)', texts.workFullItem3);
      this.updateTextContent('#work .grid-item:nth-child(3) h3', `<i class="fas fa-puzzle-piece"></i> ${texts.workCustom}`);
      this.updateTextContent('#work .grid-item:nth-child(3) li:nth-child(1)', texts.workCustomItem1);
      this.updateTextContent('#work .grid-item:nth-child(3) li:nth-child(2)', texts.workCustomItem2);
      this.updateTextContent('#work .grid-item:nth-child(3) li:nth-child(3)', texts.workCustomItem3);
      this.updateTextContent('#work .grid-item:nth-child(4) h3', `<i class="fas fa-comments"></i> ${texts.workConsult}`);
      this.updateTextContent('#work .grid-item:nth-child(4) li:nth-child(1)', texts.workConsultItem1);
      this.updateTextContent('#work .grid-item:nth-child(4) li:nth-child(2)', texts.workConsultItem2);
      this.updateTextContent('#work .grid-item:nth-child(4) li:nth-child(3)', texts.workConsultItem3);
      
      // Stack section
      this.updateTextContent('#stack h2', `<i class="fas fa-layer-group"></i> ${texts.stackTitle}`);
      this.updateTextContent('#stack .grid-item:nth-child(1) h3', `<i class="fas fa-desktop"></i> ${texts.stackFront}`);
      this.updateTextContent('#stack .grid-item:nth-child(1) li:nth-child(1)', texts.stackFrontItem1);
      this.updateTextContent('#stack .grid-item:nth-child(1) li:nth-child(2)', texts.stackFrontItem2);
      this.updateTextContent('#stack .grid-item:nth-child(1) li:nth-child(3)', texts.stackFrontItem3);
      this.updateTextContent('#stack .grid-item:nth-child(1) li:nth-child(4)', texts.stackFrontItem4);
      this.updateTextContent('#stack .grid-item:nth-child(2) h3', `<i class="fas fa-database"></i> ${texts.stackBack}`);
      this.updateTextContent('#stack .grid-item:nth-child(2) li:nth-child(1)', texts.stackBackItem1);
      this.updateTextContent('#stack .grid-item:nth-child(2) li:nth-child(2)', texts.stackBackItem2);
      this.updateTextContent('#stack .grid-item:nth-child(2) li:nth-child(3)', texts.stackBackItem3);
      this.updateTextContent('#stack .grid-item:nth-child(3) h3', `<i class="fas fa-table"></i> ${texts.stackDB}`);
      this.updateTextContent('#stack .grid-item:nth-child(3) li:nth-child(1)', texts.stackDBItem1);
      this.updateTextContent('#stack .grid-item:nth-child(3) li:nth-child(2)', texts.stackDBItem2);
      this.updateTextContent('#stack .grid-item:nth-child(4) h3', `<i class="fas fa-terminal"></i> ${texts.stackDevOps}`);
      this.updateTextContent('#stack .grid-item:nth-child(4) li:nth-child(1)', texts.stackDevOpsItem1);
      this.updateTextContent('#stack .grid-item:nth-child(4) li:nth-child(2)', texts.stackDevOpsItem2);
      this.updateTextContent('#stack .grid-item:nth-child(4) li:nth-child(3)', texts.stackDevOpsItem3);
      this.updateTextContent('#stack .grid-item:nth-child(4) li:nth-child(4)', texts.stackDevOpsItem4);
      this.updateTextContent('#stack .grid-item:nth-child(5) h3', `<i class="fas fa-plug"></i> ${texts.stackAPI}`);
      this.updateTextContent('#stack .grid-item:nth-child(5) li:nth-child(1)', texts.stackAPIItem1);
      this.updateTextContent('#stack .grid-item:nth-child(5) li:nth-child(2)', texts.stackAPIItem2);
      this.updateTextContent('#stack .grid-item:nth-child(5) li:nth-child(3)', texts.stackAPIItem3);
      this.updateTextContent('#stack .grid-item:nth-child(6) h3', `<i class="fas fa-tools"></i> ${texts.stackOther}`);
      this.updateTextContent('#stack .grid-item:nth-child(6) li:nth-child(1)', texts.stackOtherItem1);
      this.updateTextContent('#stack .grid-item:nth-child(6) li:nth-child(2)', texts.stackOtherItem2);
      this.updateTextContent('#stack .grid-item:nth-child(6) li:nth-child(3)', texts.stackOtherItem3);
      
      // Contact section
      this.updateTextContent('#contact h2', `<i class="fas fa-envelope"></i> ${texts.contactTitle}`);
      this.updateTextContent('#contact p:first-of-type', texts.contactText);
      this.updateTextContent('#contact .contact p', `<i class="fab fa-telegram"></i> ${texts.contactTelegram} <a href="https://t.me/Nikorizz" target="_blank">@Nikorizz</a>`);
      
      // Swipe indicator
      this.updateTextContent('#swipe-indicator span', texts.swipeText);
      
      // Navigation tooltips
      document.querySelector('.nav-dot[data-section="intro"] .nav-tooltip').textContent = texts.navIntro;
      document.querySelector('.nav-dot[data-section="home"] .nav-tooltip').textContent = texts.navAbout;
      document.querySelector('.nav-dot[data-section="work"] .nav-tooltip').textContent = texts.navWork;
      document.querySelector('.nav-dot[data-section="stack"] .nav-tooltip').textContent = texts.navStack;
      document.querySelector('.nav-dot[data-section="contact"] .nav-tooltip').textContent = texts.navContact;
  }
  
  // Helper to update text content
  updateTextContent(selector, content) {
      const element = document.querySelector(selector);
      if (element) {
          element.innerHTML = content;
      }
  }
}

// Initialize language manager on window load
let languageManager;

document.addEventListener('DOMContentLoaded', function() {
  console.log("Инициализация менеджера языка");
  
  // Создаем только один экземпляр менеджера
  languageManager = new LanguageManager();
});

function showLanguageToggle() {
  console.log("Показываем переключатель языка");
  const langToggle = document.querySelector('.language-toggle');
  if (langToggle) {
      console.log("Элемент найден, добавляем класс visible");
      langToggle.classList.add('visible');
  } else {
      console.log("Элемент .language-toggle не найден");
  }
}

// Simplified mobile grid items setup
function setupMobileGridItems() {
  // Определяем, мобильное ли устройство или landscape режим на планшете
  const isMobileOrLandscape = isMobileDevice || (window.innerWidth < 896 && window.innerHeight < 600);
  
  if (!isMobileOrLandscape) {
      // Убираем стрелки и восстанавливаем обычное состояние на десктопе
      document.querySelectorAll('.expand-arrow').forEach(arrow => arrow.remove());
      document.querySelectorAll('.grid-item.expanded').forEach(item => {
          item.classList.remove('expanded');
      });
      return;
  }
  
  const gridItems = document.querySelectorAll('.grid-item');

  // Сначала очищаем все старые стрелки и состояния
  gridItems.forEach(item => {
      // Удаляем существующие стрелки
      const existingArrow = item.querySelector('.expand-arrow');
      if (existingArrow) {
          existingArrow.remove();
      }
      
      // Сбрасываем состояние expanded для вертикального режима
      // Но сохраняем его для landscape, если не переключаемся между режимами
      if (window.innerHeight > window.innerWidth) {
          item.classList.remove('expanded');
      }
      
      // Добавляем стрелку
      const arrow = document.createElement('div');
      arrow.className = 'expand-arrow';
      arrow.innerHTML = '<i class="fas fa-chevron-down"></i>';
      item.appendChild(arrow);
  });
  
  // Удаляем старые обработчики событий (клонируем элементы)
  gridItems.forEach(item => {
      const newItem = item.cloneNode(true);
      if (item.parentNode) {
          item.parentNode.replaceChild(newItem, item);
      }
  });
  
  // Добавляем новые обработчики событий
  document.querySelectorAll('.grid-item').forEach(item => {
      item.addEventListener('click', function(e) {
          // Don't process if clicking on links
          if (e.target.tagName === 'A' || e.target.closest('a')) return;
          
          // Get current section
          const currentSection = this.closest('.section');
          
          // Play sound before animation to ensure it plays
          if (soundManager.enabled) {
              playSound('click');
          }
          
          // Accordion behavior - close other expanded items
          if (!this.classList.contains('expanded')) {
              currentSection.querySelectorAll('.grid-item.expanded').forEach(expandedItem => {
                  if (expandedItem !== this) {
                      expandedItem.classList.remove('expanded');
                  }
              });
          }
          
          // Toggle this item
          this.classList.toggle('expanded');
          
          e.stopPropagation();
      });
  });
}

// Handle wheel event for section scrolling - improved with debouncing
let wheelTimeout;
let lastScrollTime = Date.now();
let scrollCooldown = isMobileDevice ? 1000 : 800; // Longer cooldown on mobile

// Track scroll direction for more natural scrolling
let lastScrollDirection = 0;
let scrollDirectionChangeTime = 0;

window.addEventListener('wheel', (event) => {
  if (isAnimating || currentSection === 'landing') return;
  
  const now = Date.now();
  if (now - lastScrollTime < scrollCooldown) return;
  
  // Get scroll direction
  const direction = event.deltaY > 0 ? 1 : -1;
  
  // If user changed scroll direction, add a small delay
  if (direction !== lastScrollDirection && lastScrollDirection !== 0) {
      if (now - scrollDirectionChangeTime < 400) return;
      scrollDirectionChangeTime = now;
  }
  
  lastScrollDirection = direction;
  
  // Check if user is scrolling within a section that has scrollable content
  const currentSectionElem = document.getElementById(currentSection);
  if (currentSectionElem) {
      // Only capture section changes if we're at the top or bottom of content
      // Added a larger threshold for smoother transitions
      if (
          (direction > 0 && currentSectionElem.scrollTop + currentSectionElem.clientHeight >= currentSectionElem.scrollHeight - 20) || 
          (direction < 0 && currentSectionElem.scrollTop <= 20)
      ) {
          const currentIndex = sections.indexOf(currentSection);
          let newIndex = currentIndex + direction;

          if (newIndex >= 0 && newIndex < sections.length) {
              lastScrollTime = now;
              
              // Speed up the cloud effect during scrolling
              if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
                  try {
                      sharedCloudEffect.setOptions({ speed: isMobileDevice ? 1.8 : 2.0 });
                      setTimeout(() => {
                          sharedCloudEffect.setOptions({ speed: isMobileDevice ? 0.8 : 1.0 });
                      }, 800);
                  } catch (err) {
                      console.log("Could not adjust cloud speed:", err);
                  }
              }
              
              changeSection(sections[newIndex]);
          }
      }
  }
});

// Orient change handler for mobile devices
window.addEventListener('orientationchange', function() {
  // Обновляем статус мобильного устройства
  isMobileDevice = detectMobile();
  
  // Определяем текущую ориентацию
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  
  // Ждем завершения поворота
  setTimeout(() => {
      // Сбрасываем все расширенные элементы только если переключаемся между portrait и landscape
      // Но переинициализируем, чтобы стрелки отображались правильно
      setupMobileGridItems();
      
      // Обновляем размеры
      handleResize();
      
      // Форсируем применение правильных медиа-запросов
      if (isPortrait) {
          document.body.classList.remove('landscape');
          document.body.classList.add('portrait');
      } else {
          document.body.classList.remove('portrait');
          document.body.classList.add('landscape');
      }
      
      // Обновляем настройки облаков для новой ориентации
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({
              scale: isMobileDevice ? (isPortrait ? 1.0 : 0.8) : 1.2
          });
      }
      
      // Перерисовываем текущую секцию
      if (currentSection !== "landing") {
          const currentSectionElem = document.getElementById(currentSection);
          if (currentSectionElem) {
              // Принудительно обновляем layout
              currentSectionElem.style.display = 'none';
              void currentSectionElem.offsetHeight; // Force reflow
              currentSectionElem.style.display = '';
          }
      }
      
      // Обновляем позиционирование
      optimizePositioning();
      
      // Исправляем возможные проблемы с layout
      fixLayoutAfterOrientationChange();
  }, 300);
});

// Добавляем обработчик resize для более точной адаптации
let resizeTimeout;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
      const newIsMobile = detectMobile();
      
      // Если изменился статус мобильного устройства или мы в landscape
      if (newIsMobile !== isMobileDevice || (window.innerWidth < 896 && window.innerHeight < 600)) {
          isMobileDevice = newIsMobile;
          setupMobileGridItems();
      }
      
      handleResize();
  }, 250);
});

// Add window resize handler
window.addEventListener('resize', function() {
  // Use debouncing to prevent too many resize events
  clearTimeout(wheelTimeout);
  wheelTimeout = setTimeout(handleResize, 100);
});

// Handle window resize to ensure everything scales properly
function handleResize() {
  // Update canvas dimensions if eye is active
  if (document.getElementById('eye-container').style.display === 'block') {
      const canvas = document.getElementById('fof').querySelector('canvas');
      if (canvas) {
          canvas.style.width = window.innerWidth + 'px';
          canvas.style.height = window.innerHeight + 'px';
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
      }
  }
  
  // Update cloud effect if active
  if (sharedCloudEffect && typeof sharedCloudEffect.resize === 'function') {
      sharedCloudEffect.resize();
  }
  
  // Update globe effect if active
  if (globeEffect && typeof globeEffect.resize === 'function') {
      globeEffect.resize();
  }
  
  // Обновляем позиционирование при изменении размера
  optimizePositioning();
}

// Event listeners for navigation
document.addEventListener('DOMContentLoaded', () => {
  const navigation = document.querySelector('.navigation');
  if (navigation) {
      navigation.classList.remove('visible');
  }
  
  const enterBtn = document.getElementById('enter-btn');
  if (enterBtn) {
      enterBtn.addEventListener('click', (e) => {
          // Проверяем, что мы на landing странице
          if (currentSection === 'landing') {
              enterSite();
          }
          e.preventDefault(); // Предотвращаем стандартное поведение
      });
      console.log("Enter button event listener attached");
  } else {
      console.error("Enter button not found!");
  }
  
  // Navigation dots
  document.querySelectorAll('.nav-dot').forEach(dot => {
      dot.addEventListener('click', () => {
          // Play click sound before changing section
          playSound('click');
          
          const section = dot.dataset.section;
          changeSection(section);
      });
  });
});

// Обработчик клавиатурной навигации
document.addEventListener('keydown', (event) => {
  // Проверяем, что это клавиши стрелок вверх или вниз
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  
  // Не обрабатываем, если на странице landing или идет анимация
  if (isAnimating || currentSection === 'landing') return;
  
  // Проверяем cooldown (используем тот же, что и для колесика мыши)
  const now = Date.now();
  if (now - lastScrollTime < scrollCooldown) return;
  
  // Определяем направление: вверх = -1, вниз = 1
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  
  // Проверяем изменение направления
  if (direction !== lastScrollDirection && lastScrollDirection !== 0) {
      if (now - scrollDirectionChangeTime < 400) return;
      scrollDirectionChangeTime = now;
  }
  
  lastScrollDirection = direction;
  
  // Получаем текущую секцию
  const currentSectionElem = document.getElementById(currentSection);
  if (currentSectionElem) {
      // Проверяем, можем ли мы переключать секции
      // (только если находимся в начале или конце прокручиваемого контента)
      if (
          (direction > 0 && currentSectionElem.scrollTop + currentSectionElem.clientHeight >= currentSectionElem.scrollHeight - 20) || 
          (direction < 0 && currentSectionElem.scrollTop <= 20)
      ) {
          const currentIndex = sections.indexOf(currentSection);
          let newIndex = currentIndex + direction;

          if (newIndex >= 0 && newIndex < sections.length) {
              lastScrollTime = now;
              
              // Ускоряем эффект облаков при переключении
              if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
                  try {
                      sharedCloudEffect.setOptions({ speed: isMobileDevice ? 1.8 : 2.0 });
                      setTimeout(() => {
                          sharedCloudEffect.setOptions({ speed: isMobileDevice ? 0.8 : 1.0 });
                      }, 800);
                  } catch (err) {
                      console.log("Could not adjust cloud speed:", err);
                  }
              }
              
              // Переключаем секцию
              changeSection(sections[newIndex]);
              
              // Предотвращаем стандартное поведение прокрутки
              event.preventDefault();
          }
      }
  }
});

// Дополнительная клавиатурная навигация
document.addEventListener('keydown', (event) => {
  if (isAnimating || currentSection === 'landing') return;
  
  switch(event.key) {
      case 'PageUp':
          event.preventDefault();
          const prevIndex = Math.max(0, sections.indexOf(currentSection) - 1);
          if (prevIndex !== sections.indexOf(currentSection)) {
              changeSection(sections[prevIndex]);
          }
          break;
          
      case 'PageDown':
          event.preventDefault();
          const nextIndex = Math.min(sections.length - 1, sections.indexOf(currentSection) + 1);
          if (nextIndex !== sections.indexOf(currentSection)) {
              changeSection(sections[nextIndex]);
          }
          break;
          
      case 'Home':
          event.preventDefault();
          if (currentSection !== 'intro') {
              changeSection('intro');
          }
          break;
          
      case 'End':
          event.preventDefault();
          if (currentSection !== 'contact') {
              changeSection('contact');
          }
          break;
  }
});

// Функция для адаптации контента в landscape
function adaptLandscapeLayout() {
  if (window.innerWidth > window.innerHeight && window.innerWidth < 896) {
      // Принудительно масштабируем контент для landscape
      const sections = document.querySelectorAll('.section');
      sections.forEach(section => {
          section.style.height = '100vh';
          section.style.maxHeight = '100vh';
      });
      
      // Адаптируем облака
      if (sharedCloudEffect && typeof sharedCloudEffect.setOptions === 'function') {
          sharedCloudEffect.setOptions({
              scale: 0.7,
              cloudHeight: 0.3,
              cloudCover: 0.1
          });
      }
  }
}

// При загрузке страницы
window.addEventListener('load', adaptLandscapeLayout);

// Функция для адаптации размера контента
function adaptContentSize() {
  const sections = document.querySelectorAll('.section');
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  
  sections.forEach(section => {
      const content = section.querySelector('.content-grid');
      if (content) {
          // Вычисляем доступное пространство
          const headerHeight = section.querySelector('h2')?.offsetHeight || 0;
          const padding = 40; // padding секции
          const availableHeight = viewportHeight - headerHeight - padding * 2;
          
          // Устанавливаем максимальную высоту
          content.style.maxHeight = `${availableHeight}px`;
          
          // Адаптируем количество колонок если контент не помещается
          const items = content.querySelectorAll('.grid-item');
          if (items.length > 4 && viewportHeight < 700) {
              content.style.gridTemplateColumns = 'repeat(3, 1fr)';
          }
          
          // Для мобильных устройств в landscape
          if (viewportWidth < 896 && viewportWidth > viewportHeight) {
              content.style.gridTemplateColumns = 'repeat(2, 1fr)';
              content.style.gap = '0.5rem';
          }
      }
  });
}

// Вызываем при загрузке и изменении размера
window.addEventListener('load', adaptContentSize);
window.addEventListener('resize', debounce(adaptContentSize, 150));
window.addEventListener('orientationchange', () => {
  setTimeout(adaptContentSize, 100);
});

// Функция debounce для оптимизации
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
      const later = () => {
          clearTimeout(timeout);
          func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
  };
}

// Функция для исправления layout после смены ориентации
function fixLayoutAfterOrientationChange() {
  // Сбрасываем стили, которые могли быть применены inline
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => {
      section.style.removeProperty('transform');
      section.style.removeProperty('padding-left');
      section.style.removeProperty('padding-right');
      section.style.removeProperty('margin-left');
      section.style.removeProperty('margin-right');
  });
  
  // Исправляем контейнеры контента и сбрасываем grid стили
  const contentGrids = document.querySelectorAll('.content-grid');
  contentGrids.forEach(grid => {
      grid.style.removeProperty('margin-left');
      grid.style.removeProperty('margin-right');
      grid.style.removeProperty('grid-template-columns'); // Важно! Сбрасываем инлайн стили для grid
      grid.style.removeProperty('gap');
      grid.style.removeProperty('max-height');
  });
  
  // Сбрасываем стили для grid items
  const gridItems = document.querySelectorAll('.grid-item');
  gridItems.forEach(item => {
      item.style.removeProperty('padding');
      item.style.removeProperty('height');
  });
  
  // Принудительно центрируем заголовки
  const headers = document.querySelectorAll('h1, h2, h3');
  headers.forEach(header => {
      header.style.textAlign = 'center';
      header.style.width = '100%';
  });
  
  // Форсируем перерасчет стилей
  document.body.offsetHeight;
}

// Animation Request frame polyfill
window.requestAnimFrame = (function(){
return  window.requestAnimationFrame       ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame    ||
        window.oRequestAnimationFrame      ||
        window.msRequestAnimationFrame     ||
        function(callback){
          window.setTimeout(callback, 1000 / 60);
        };
})();

// В конце файла добавляем спецобработку для iOS
if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  // Специальная обработка для iOS устройств
  document.addEventListener('touchstart', function initAudioOnFirstTouch() {
      forceIOSAudioUnlock();
      document.removeEventListener('touchstart', initAudioOnFirstTouch);
  }, { once: true });
  
  // Дополнительная проверка для полного экрана на iOS
  window.addEventListener('resize', function() {
      // Обработка изменений ориентации для iOS отдельно
      setTimeout(function() {
          optimizePositioning();
          fixLayoutAfterOrientationChange();
      }, 300);
  });
}