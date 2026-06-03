// Define global window type extension for Cesium base url before any imports
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}
window.CESIUM_BASE_URL = '/cesium/';

import * as Cesium from 'cesium';
import './style.css';

// TypeScript Type Definitions
interface TravelPin {
  id: string;
  title: string;
  lat: number;
  lng: number;
  desc: string;
  createdAt: number;
}

// State variables
let pins: TravelPin[] = [];
let isUserInteracting = false;
let rotationTimeout: number | undefined;
let isAddPinMode = false;

// DOM Elements
const visitedCountEl = document.getElementById('visitedCount') as HTMLSpanElement;
const countryCountEl = document.getElementById('countryCount') as HTMLSpanElement;
const destinationContainer = document.getElementById('destinationContainer') as HTMLDivElement;
const btnAddPin = document.getElementById('btnAddPin') as HTMLButtonElement;
const modeBanner = document.getElementById('modeBanner') as HTMLDivElement;
const btnCancelMode = document.getElementById('btnCancelMode') as HTMLButtonElement;
const modalBackdrop = document.getElementById('modalBackdrop') as HTMLDivElement;
const btnCancelModal = document.getElementById('btnCancelModal') as HTMLButtonElement;
const pinForm = document.getElementById('pinForm') as HTMLFormElement;
const inputTitle = document.getElementById('inputTitle') as HTMLInputElement;
const inputLat = document.getElementById('inputLat') as HTMLInputElement;
const inputLng = document.getElementById('inputLng') as HTMLInputElement;
const inputDesc = document.getElementById('inputDesc') as HTMLTextAreaElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;
const toastMessageEl = document.getElementById('toastMessage') as HTMLSpanElement;
const cesiumContainer = document.getElementById('cesiumContainer') as HTMLDivElement;

// 1. Initialize Cesium Viewer (Bright Pastel Theme setup)
// Use CartoDB Voyager with WebMercatorTilingScheme for detailed resolution on zoom in
const lightImageryProvider = new Cesium.UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
  credit: '© OpenStreetMap contributors, © CARTO',
  minimumLevel: 0,
  maximumLevel: 20,
  tilingScheme: new Cesium.WebMercatorTilingScheme()
});

const viewer = new Cesium.Viewer('cesiumContainer', {
  animation: false,
  timeline: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
  baseLayerPicker: false,
  sceneModePicker: false,
  homeButton: false,
  geocoder: false,
  fullscreenButton: false,
  baseLayer: new Cesium.ImageryLayer(lightImageryProvider)
});

// Configure Bright atmosphere and background
const scene = viewer.scene;
scene.skyBox.show = false; // Hide black outer space
scene.skyAtmosphere.show = true; // Show atmosphere
scene.backgroundColor = Cesium.Color.fromCssColorString('#f0f4f8'); // Light gray-blue canvas background

// Disable default lighting contrast so that the whole globe is evenly lit
scene.globe.enableLighting = false;

// Customize atmosphere colors to make it pastel and bright
const globe = scene.globe;
globe.showWaterEffect = true;
globe.depthTestAgainstTerrain = false;

// Configure fog for pastel horizon blending
if (scene.fog) {
  scene.fog.enabled = true;
  scene.fog.density = 0.00015;
}

// Enable zooming down close to surface
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100.0; // 100 meters minimum zoom
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 25000000.0; // Max zoom out

// Set initial camera view showing the whole Earth
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(127.0, 37.5, 10000000.0), // Focus on East Asia initially
  orientation: {
    heading: Cesium.Math.toRadians(0.0),
    pitch: Cesium.Math.toRadians(-75.0),
    roll: 0.0
  }
});

// 2. LocalStorage Persistence Functions
const loadPins = (): void => {
  const savedPins = localStorage.getItem('travel_pins');
  if (savedPins) {
    try {
      pins = JSON.parse(savedPins);
    } catch (e) {
      console.error('Failed to parse travel pins', e);
      pins = [];
    }
  } else {
    pins = [];
  }
};

const savePins = (): void => {
  localStorage.setItem('travel_pins', JSON.stringify(pins));
};

// 3. Toast Message Helper
const showToast = (message: string): void => {
  toastMessageEl.textContent = message;
  toastEl.style.display = 'flex';
  toastEl.style.animation = 'none';
  // Trigger reflow
  void toastEl.offsetWidth;
  toastEl.style.animation = 'fadeInUp 0.5s ease both';
  
  // Auto hide after 3 seconds
  setTimeout(() => {
    toastEl.style.animation = 'fadeOutDown 0.5s ease both';
    setTimeout(() => {
      if (toastEl.style.animationName === 'fadeOutDown') {
        toastEl.style.display = 'none';
      }
    }, 500);
  }, 3000);
};

// 4. Create and Render Pins on 3D Globe
const renderPinsOnGlobe = (): void => {
  // Clear existing pin entities
  viewer.entities.removeAll();

  pins.forEach((pin) => {
    const position = Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat);
    
    // Add point for the pin location (Soft pastel primary color)
    viewer.entities.add({
      id: pin.id,
      position: position,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#8b5cf6'), // Lavender violet
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY // Keep visible behind terrain
      },
      label: {
        text: pin.title,
        font: 'bold 12px Inter, sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.fromCssColorString('#1e293b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  });
};

// 5. Update UI Sidebar & Counters
const updateSidebarList = (): void => {
  // Update stats counters
  visitedCountEl.textContent = pins.length.toString();
  
  const uniqueLocs = new Set(pins.map(p => `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`));
  countryCountEl.textContent = Math.min(pins.length, uniqueLocs.size).toString();

  // Render list
  if (pins.length === 0) {
    destinationContainer.innerHTML = `
      <div class="empty-state">
        <p>아직 등록된 여행지가 없습니다.</p>
        <p class="helper-text">아래 버튼으로 새 여행지를 추가해보세요!</p>
      </div>
    `;
    return;
  }

  destinationContainer.innerHTML = '';
  const sortedPins = [...pins].sort((a, b) => b.createdAt - a.createdAt);

  sortedPins.forEach((pin) => {
    const card = document.createElement('div');
    card.className = 'travel-item-card';
    card.setAttribute('data-id', pin.id);
    
    card.innerHTML = `
      <div class="travel-item-header">
        <span class="travel-item-title">${pin.title}</span>
        <span class="travel-item-coords">${pin.lat.toFixed(2)}°, ${pin.lng.toFixed(2)}°</span>
      </div>
      <p class="travel-item-desc">${pin.desc}</p>
      <button class="btn-delete-pin" aria-label="Delete location" data-id="${pin.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
      </button>
    `;

    // Click handler to zoom to coordinates
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn-delete-pin')) return;
      zoomToPin(pin);
    });

    // Delete handler
    const deleteBtn = card.querySelector('.btn-delete-pin') as HTMLButtonElement;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePin(pin.id);
    });

    destinationContainer.appendChild(card);
  });
};

// Zoom camera to pin with elegant ease animation (Very detailed look on zoom in)
const zoomToPin = (pin: TravelPin): void => {
  stopRotation();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat, 2000.0), // Zoom in closely (2km altitude) for detailed map
    duration: 2.5,
    pitchAdjustHeight: 15000
  });
  showToast(`${pin.title}(으)로 이동합니다.`);
};

// Delete pin logic
const deletePin = (id: string): void => {
  pins = pins.filter(p => p.id !== id);
  savePins();
  renderPinsOnGlobe();
  updateSidebarList();
  showToast('여행 기록이 삭제되었습니다.');
};

// 6. Interactive Pin Creation logic
// Toggle Pin Add Mode
const enableAddPinMode = (): void => {
  isAddPinMode = true;
  btnAddPin.classList.add('active-mode');
  modeBanner.classList.add('active');
  cesiumContainer.classList.add('add-pin-mode');
  showToast('핀 추가 모드가 켜졌습니다. 지도의 한 점을 클릭해주세요.');
};

const disableAddPinMode = (): void => {
  isAddPinMode = false;
  btnAddPin.classList.remove('active-mode');
  modeBanner.classList.remove('active');
  cesiumContainer.classList.remove('add-pin-mode');
};

// Listeners for toggle buttons
btnAddPin.addEventListener('click', () => {
  if (isAddPinMode) {
    disableAddPinMode();
  } else {
    enableAddPinMode();
  }
});

btnCancelMode.addEventListener('click', () => {
  disableAddPinMode();
  showToast('핀 추가 모드가 취소되었습니다.');
});

// Map click action using ScreenSpaceEventHandler
const screenSpaceHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

screenSpaceHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
  // Stop earth rotation on interaction
  stopRotation();
  
  // If pin add mode is not active, normal globe navigation occurs (do not add pins)
  if (!isAddPinMode) return;

  // Find point on Earth surface
  const ray = viewer.camera.getPickRay(click.position);
  if (!ray) return;
  const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  
  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    
    // Fill coordinates in form and open modal
    inputLat.value = latitude.toFixed(6);
    inputLng.value = longitude.toFixed(6);
    inputTitle.value = '';
    inputDesc.value = '';
    
    // Deactivate add pin mode as we are launching modal
    disableAddPinMode();
    openModal();
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 7. Modal Handlers
const openModal = (): void => {
  modalBackdrop.classList.add('active');
  inputTitle.focus();
};

const closeModal = (): void => {
  modalBackdrop.classList.remove('active');
};

btnCancelModal.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) {
    closeModal();
  }
});

// Handle form submission
pinForm.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  
  const title = inputTitle.value.trim();
  const lat = parseFloat(inputLat.value);
  const lng = parseFloat(inputLng.value);
  const desc = inputDesc.value.trim();
  
  if (!title || isNaN(lat) || isNaN(lng) || !desc) {
    alert('모든 필드를 올바르게 입력해주세요.');
    return;
  }

  const newPin: TravelPin = {
    id: 'pin_' + Date.now(),
    title,
    lat,
    lng,
    desc,
    createdAt: Date.now()
  };

  pins.push(newPin);
  savePins();
  renderPinsOnGlobe();
  updateSidebarList();
  closeModal();
  
  // Elegant camera flight to the newly added pin (Detailed 2.5km zoom)
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, 2500.0),
    duration: 2.0
  });
  
  showToast(`새로운 추억 '${title}'이(가) 등록되었습니다!`);
});

// 8. Auto Earth Rotation Logic
let lastTime = Date.now();
const spinRate = 0.005;

const onTickEventListener = (): void => {
  if (!isUserInteracting && viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
    const camera = viewer.camera;
    const currentTime = Date.now();
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    camera.rotate(Cesium.Cartesian3.UNIT_Z, spinRate * delta);
  } else {
    lastTime = Date.now();
  }
};

viewer.clock.onTick.addEventListener(onTickEventListener);

const stopRotation = (): void => {
  isUserInteracting = true;
  if (rotationTimeout) {
    clearTimeout(rotationTimeout);
  }
  // Resume rotation after 15 seconds of inactivity
  rotationTimeout = window.setTimeout(() => {
    isUserInteracting = false;
    lastTime = Date.now();
  }, 15000);
};

// Track user interactions to stop rotation
const interactionHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
const onUserInteraction = (): void => {
  stopRotation();
};

interactionHandler.setInputAction(onUserInteraction, Cesium.ScreenSpaceEventType.LEFT_DOWN);
interactionHandler.setInputAction(onUserInteraction, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
interactionHandler.setInputAction(onUserInteraction, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
interactionHandler.setInputAction(onUserInteraction, Cesium.ScreenSpaceEventType.WHEEL);

// 9. Initial Setup Execution
loadPins();
renderPinsOnGlobe();
updateSidebarList();

// Showcase initial welcoming message
setTimeout(() => {
  showToast('지도 위에서 자유롭게 여행지를 찾아보세요! 🗺️');
}, 1000);
