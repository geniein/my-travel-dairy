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
  photoUrl?: string;
}

// State variables
let pins: TravelPin[] = [];
let isUserInteracting = false;
let rotationTimeout: number | undefined;
let isAddPinMode = false;
let isRotationEnabled = true;
let countryFeatures: any[] = [];
const countriesDataSource = new Cesium.GeoJsonDataSource();
let activePhoto: GalleryPhoto | null = null;
let activePhotoPinEntity: Cesium.Entity | null = null;
let selectedPinId: string | null = null;
let isShowPhotoPreviews = true;
const savedShowPreviews = localStorage.getItem('show_photo_previews');
if (savedShowPreviews) {
  isShowPhotoPreviews = savedShowPreviews === 'true';
}


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
const btnToggleSpin = document.getElementById('btnToggleSpin') as HTMLButtonElement;
const spinButtonText = document.getElementById('spinButtonText') as HTMLSpanElement;
const btnMode3D = document.getElementById('btnMode3D') as HTMLButtonElement;
const btnMode2D = document.getElementById('btnMode2D') as HTMLButtonElement;

// Photo Upload Modal Elements
const inputPhotoFile = document.getElementById('inputPhotoFile') as HTMLInputElement;
const inputPhotoUrl = document.getElementById('inputPhotoUrl') as HTMLInputElement;
const btnImageUpload = document.getElementById('btnImageUpload') as HTMLButtonElement;
const formPhotoPreview = document.getElementById('formPhotoPreview') as HTMLDivElement;
const formPreviewImg = document.getElementById('formPreviewImg') as HTMLImageElement;
const btnRemoveFormPhoto = document.getElementById('btnRemoveFormPhoto') as HTMLButtonElement;



// 1. Initialize Cesium Viewer (Bright Pastel Theme setup)
// Setup helper to create imagery provider based on connectivity
const updateImageryLayer = async (isOnline: boolean): Promise<void> => {
  viewer.imageryLayers.removeAll();
  try {
    if (isOnline) {
      const onlineProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=0LZXzSytIUhUhRu9rO0g&language=ko',
        credit: '© MapTiler © OpenStreetMap contributors',
        minimumLevel: 0,
        maximumLevel: 20,
        tilingScheme: new Cesium.WebMercatorTilingScheme()
      });
      viewer.imageryLayers.addImageryProvider(onlineProvider);
    } else {
      const offlineProvider = await Cesium.TileMapServiceImageryProvider.fromUrl(
        window.CESIUM_BASE_URL + 'Assets/Textures/NaturalEarthII'
      );
      viewer.imageryLayers.addImageryProvider(offlineProvider);
    }
  } catch (err) {
    console.error('Failed to load imagery layer:', err);
  }
};

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
  baseLayer: false // Initialize with no base layer, we add it asynchronously below
});

// Load the initial imagery layer
void updateImageryLayer(navigator.onLine);

// Dynamically handle online/offline transitions
window.addEventListener('online', () => {
  showToast('인터넷에 연결되었습니다. 고해상도 지도를 불러옵니다. 🌐');
  void updateImageryLayer(true);
});

window.addEventListener('offline', () => {
  showToast('인터넷 연결이 끊겼습니다. 로컬 오프라인 지도로 전환합니다. 📡');
  void updateImageryLayer(false);
});

// Add the country boundaries vector layer datasource
viewer.dataSources.add(countriesDataSource);



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

// --- Geographic Point-In-Polygon & Country Highlight Utilities ---

// Ray-casting point-in-polygon algorithm (standard 2D polygon hit-test)
const isPointInPolygon = (point: [number, number], vs: [number, number][]): boolean => {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0];
    const yi = vs[i][1];
    const xj = vs[j][0];
    const yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Check if a coordinate [lng, lat] is inside a GeoJSON geometry (handles Polygon and MultiPolygon)
const isPointInGeometry = (point: [number, number], geometry: any): boolean => {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return isPointInPolygon(point, geometry.coordinates[0] as [number, number][]);
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon: any) => {
      return isPointInPolygon(point, polygon[0] as [number, number][]);
    });
  }
  return false;
};

// Find the matched country name or code for coordinates (lng, lat)
const findCountryForCoordinates = (lng: number, lat: number): string | null => {
  if (!countryFeatures || countryFeatures.length === 0) return null;
  const point: [number, number] = [lng, lat];
  for (const feature of countryFeatures) {
    if (isPointInGeometry(point, feature.geometry)) {
      // Prioritize ISO 3-letter code, then default name
      return feature.properties.iso_a3 || feature.properties.name || null;
    }
  }
  return null;
};

// Helper to safely get a property value from Cesium entity properties (which can be properties or plain values)
const getPropertyValue = (prop: any): any => {
  if (prop && typeof prop.getValue === 'function') {
    try {
      return prop.getValue(Cesium.JulianDate.now());
    } catch (e) {
      return prop.getValue();
    }
  }
  return prop;
};

// Update highlighted countries based on the current pin list
const updateCountryHighlights = (): void => {
  if (!countryFeatures || countryFeatures.length === 0) {
    console.warn('[Highlights] Skip update, countryFeatures not loaded yet.');
    return;
  }

  // 1. Identify visited countries
  const visited = new Set<string>();
  pins.forEach(pin => {
    const matchedCountry = findCountryForCoordinates(pin.lng, pin.lat);
    if (matchedCountry) {
      visited.add(matchedCountry);
    }
  });

  console.log('[Highlights] Active pins matched countries:', Array.from(visited));

  // 2. Loop through entities in the data source to apply material styles
  let highlightCount = 0;
  countriesDataSource.entities.values.forEach(entity => {
    if (!entity.polygon) return;

    entity.polygon.outline = new Cesium.ConstantProperty(false);
    entity.polygon.fill = new Cesium.ConstantProperty(true);
    
    const isoCode = getPropertyValue(entity.properties?.iso_a3);
    const name = getPropertyValue(entity.properties?.name);
    const isVisited = (isoCode && visited.has(isoCode)) || (name && visited.has(name));

    if (isVisited) {
      highlightCount++;
      entity.polygon.height = undefined; // Force undefined to enable GroundPrimitive clamping
      // Soft pastel yellow with transparency for aesthetic glass look
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString('rgba(234, 179, 8, 0.45)')
      );
    } else {
      entity.polygon.height = undefined; // Force undefined to enable GroundPrimitive clamping
      // Transparent default style
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString('rgba(255, 255, 255, 0.01)')
      );
    }
  });

  console.log(`[Highlights] Updated map. Highlighted ${highlightCount} countries.`);
};

// 4. Create and Render Pins on 3D Globe
const renderPinsOnGlobe = (): void => {
  // Clear existing pin entities
  viewer.entities.removeAll();

  // Re-add active photo pin entity if it exists
  if (activePhoto) {
    activePhotoPinEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(activePhoto.lng, activePhoto.lat),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString('#06b6d4'), // Bright Cyan
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  }

  // Clear existing travel pin DOM overlays
  if (travelPinOverlaysContainer) {
    travelPinOverlaysContainer.innerHTML = '';
  }

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
        disableDepthTestDistance: Number.POSITIVE_INFINITY // Keep visible behind terrain
      },
      ...((pin.photoUrl && isShowPhotoPreviews) ? {} : {
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
      })
    });

    // Create DOM overlay for pins with photo
    if (pin.photoUrl && isShowPhotoPreviews && travelPinOverlaysContainer) {
      const overlay = document.createElement('div');
      overlay.className = 'photo-preview-overlay travel-pin-overlay';
      overlay.setAttribute('data-pin-id', pin.id);
      overlay.style.display = 'none'; // hidden until positioned by postRender

      overlay.innerHTML = `
        <div class="polaroid-frame">
          <div class="polaroid-img-wrapper">
            <img src="${pin.photoUrl}" alt="${pin.title}" />
          </div>
          <div class="polaroid-caption">
            <span class="polaroid-date" title="${pin.title}">${pin.title}</span>
            <span class="polaroid-heart">❤️</span>
          </div>
        </div>
        <div class="polaroid-pointer"></div>
      `;

      // Zoom and show preview on click
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        zoomToPin(pin);
        if (pin.photoUrl) {
          const date = new Date(pin.createdAt);
          const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
          showPhotoPreview({
            id: pin.id,
            url: pin.photoUrl,
            lat: pin.lat,
            lng: pin.lng,
            dateString: dateString
          });
        } else {
          clearPhotoPreview();
        }
      });

      travelPinOverlaysContainer.appendChild(overlay);
    }
  });

  // Highlight visited countries based on the current pin list
  updateCountryHighlights();
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
    
    let photoHtml = '';
    if (pin.photoUrl) {
      photoHtml = `
        <div class="travel-item-photo">
          <img src="${pin.photoUrl}" alt="${pin.title}" />
        </div>
      `;
    }
    
    card.innerHTML = `
      ${photoHtml}
      <div class="travel-item-content">
        <div class="travel-item-header">
          <span class="travel-item-title">${pin.title}</span>
          <span class="travel-item-coords">${pin.lat.toFixed(2)}°, ${pin.lng.toFixed(2)}°</span>
        </div>
        <p class="travel-item-desc">${pin.desc}</p>
      </div>
      <button class="btn-delete-pin" aria-label="Delete location" data-id="${pin.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
      </button>
    `;

    // Click handler to zoom to coordinates
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn-delete-pin')) return;
      zoomToPin(pin);
      if (pin.photoUrl) {
        const date = new Date(pin.createdAt);
        const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        showPhotoPreview({
          id: pin.id,
          url: pin.photoUrl,
          lat: pin.lat,
          lng: pin.lng,
          dateString: dateString
        });
      } else {
        clearPhotoPreview();
      }
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
  selectedPinId = pin.id;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat, 2000.0), // Zoom in closely (2km altitude) for detailed map
    duration: 2.5,
    pitchAdjustHeight: 15000
  });
  showToast(`${pin.title}(으)로 이동합니다.`);
  updateOverlayPosition();
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
  
  // If pin add mode is not active, handle clicking on existing pins (picking)
  if (!isAddPinMode) {
    const pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id) {
      const clickedPin = pins.find(p => p.id === pickedObject.id.id);
      if (clickedPin) {
        zoomToPin(clickedPin);
        if (clickedPin.photoUrl) {
          const date = new Date(clickedPin.createdAt);
          const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
          showPhotoPreview({
            id: clickedPin.id,
            url: clickedPin.photoUrl,
            lat: clickedPin.lat,
            lng: clickedPin.lng,
            dateString: dateString
          });
        } else {
          clearPhotoPreview();
        }
      } else if (activePhotoPinEntity && pickedObject.id === activePhotoPinEntity && activePhoto) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(activePhoto.lng, activePhoto.lat, 1000.0),
          duration: 1.5
        });
      }
    } else {
      clearPhotoPreview();
    }
    return;
  }

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
  // Clear photo selection on close
  if (inputPhotoFile) inputPhotoFile.value = '';
  if (inputPhotoUrl) inputPhotoUrl.value = '';
  if (formPhotoPreview) formPhotoPreview.style.display = 'none';
};

btnCancelModal.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) {
    closeModal();
  }
});

// Photo upload event bindings
if (btnImageUpload && inputPhotoFile) {
  btnImageUpload.addEventListener('click', () => {
    inputPhotoFile.click();
  });
}

if (inputPhotoFile) {
  inputPhotoFile.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (inputPhotoUrl && formPhotoPreview && formPreviewImg) {
          inputPhotoUrl.value = base64;
          formPreviewImg.src = base64;
          formPhotoPreview.style.display = 'flex';
        }
      };
      reader.readAsDataURL(file);
    }
  });
}

if (btnRemoveFormPhoto) {
  btnRemoveFormPhoto.addEventListener('click', () => {
    if (inputPhotoFile) inputPhotoFile.value = '';
    if (inputPhotoUrl) inputPhotoUrl.value = '';
    if (formPhotoPreview) formPhotoPreview.style.display = 'none';
  });
}

// Handle form submission
pinForm.addEventListener('submit', (e: Event) => {
  e.preventDefault();
  
  const title = inputTitle.value.trim();
  const lat = parseFloat(inputLat.value);
  const lng = parseFloat(inputLng.value);
  const desc = inputDesc.value.trim();
  const photoUrl = inputPhotoUrl ? inputPhotoUrl.value.trim() : '';
  
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
    createdAt: Date.now(),
    ...(photoUrl ? { photoUrl } : {})
  };

  pins.push(newPin);
  savePins();
  clearPhotoPreview();
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
  if (isRotationEnabled && !isUserInteracting && viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
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
  if (!isRotationEnabled) return;
  
  // Deactivate auto-rotation permanently on any map interaction
  isRotationEnabled = false;
  btnToggleSpin.classList.add('paused');
  spinButtonText.textContent = '자전 시작하기';
  
  if (rotationTimeout) {
    clearTimeout(rotationTimeout);
  }
  isUserInteracting = true; // Stop rotation ticks
  showToast('자동 자전이 중지되었습니다. ⏸️');
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

// Auto rotation toggle button click listener
btnToggleSpin.addEventListener('click', () => {
  isRotationEnabled = !isRotationEnabled;
  if (isRotationEnabled) {
    btnToggleSpin.classList.remove('paused');
    spinButtonText.textContent = '자전 멈추기';
    isUserInteracting = false; // Reset interaction flag to resume immediately
    lastTime = Date.now();
    showToast('자동 자전이 다시 켜졌습니다. 🌍');
  } else {
    btnToggleSpin.classList.add('paused');
    spinButtonText.textContent = '자전 시작하기';
    if (rotationTimeout) {
      clearTimeout(rotationTimeout);
    }
    isUserInteracting = true; // Stop rotation tick
    showToast('자동 자전을 멈췄습니다. ⏸️');
  }
});

// View Mode Toggle Listeners (3D Globe vs 2D Flat Map)
btnMode3D.addEventListener('click', () => {
  if (viewer.scene.mode !== Cesium.SceneMode.SCENE3D) {
    btnMode3D.classList.add('active');
    btnMode2D.classList.remove('active');
    viewer.scene.morphTo3D(1.5); // Morph to 3D Globe with a 1.5-second animation transition
    
    // Resume auto-rotation if enabled
    if (isRotationEnabled) {
      isUserInteracting = false;
      lastTime = Date.now();
    }
    showToast('3D 지구본 모드로 전환합니다. 🌍');
  }
});

btnMode2D.addEventListener('click', () => {
  if (viewer.scene.mode !== Cesium.SceneMode.SCENE2D) {
    btnMode2D.classList.add('active');
    btnMode3D.classList.remove('active');
    viewer.scene.morphTo2D(1.5); // Morph to 2D Flat Map with a 1.5-second animation transition
    showToast('2D 세계지도 모드로 전환합니다. 🗺️');
  }
});


// 9. Search Region Functionality (Online & Offline Support)
interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  type: 'local' | 'online';
}

const OFFLINE_CITIES: { name: string; lat: number; lng: number; keys: string[] }[] = [
  { name: '서울, 대한민국', lat: 37.5665, lng: 126.9780, keys: ['서울', 'seoul', 'korea'] },
  { name: '도쿄, 일본', lat: 35.6762, lng: 139.6503, keys: ['도쿄', 'tokyo', 'japan'] },
  { name: '파리, 프랑스', lat: 48.8566, lng: 2.3522, keys: ['파리', 'paris', 'france'] },
  { name: '뉴욕, 미국', lat: 40.7128, lng: -74.0060, keys: ['뉴욕', 'new york', 'usa', 'america'] },
  { name: '런던, 영국', lat: 51.5074, lng: -0.1278, keys: ['런던', 'london', 'uk', 'england'] },
  { name: '시드니, 호주', lat: -33.8688, lng: 151.2093, keys: ['시드니', 'sydney', 'australia'] },
  { name: '베이징, 중국', lat: 39.9042, lng: 116.4074, keys: ['베이징', 'beijing', 'china'] },
  { name: '로마, 이탈리아', lat: 41.9028, lng: 12.4964, keys: ['로마', 'rome', 'italy'] },
  { name: '방콕, 태국', lat: 13.7563, lng: 100.5018, keys: ['방콕', 'bangkok', 'thailand'] },
  { name: '제주도, 대한민국', lat: 33.4996, lng: 126.5312, keys: ['제주', 'jeju', 'korea'] },
  { name: '부산, 대한민국', lat: 35.1796, lng: 129.0756, keys: ['부산', 'busan', 'korea'] }
];

// DOM elements for search
const inputSearch = document.getElementById('inputSearch') as HTMLInputElement;
const btnClearSearch = document.getElementById('btnClearSearch') as HTMLButtonElement;
const searchResults = document.getElementById('searchResults') as HTMLDivElement;

let searchDebounceTimeout: any;

inputSearch.addEventListener('input', () => {
  const query = inputSearch.value.trim().toLowerCase();
  
  if (query.length > 0) {
    btnClearSearch.style.display = 'flex';
  } else {
    btnClearSearch.style.display = 'none';
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
    return;
  }

  if (searchDebounceTimeout) {
    clearTimeout(searchDebounceTimeout);
  }

  searchDebounceTimeout = setTimeout(() => {
    performSearch(query);
  }, 400);
});

btnClearSearch.addEventListener('click', () => {
  inputSearch.value = '';
  btnClearSearch.style.display = 'none';
  searchResults.style.display = 'none';
  searchResults.innerHTML = '';
  inputSearch.focus();
});

// Close search dropdown on click outside
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.search-section')) {
    searchResults.style.display = 'none';
  }
});

const performSearch = async (query: string): Promise<void> => {
  const results: SearchResult[] = [];

  // 1. Search offline cities (Local lookup)
  OFFLINE_CITIES.forEach(city => {
    const match = city.keys.some(key => key.includes(query)) || city.name.toLowerCase().includes(query);
    if (match) {
      results.push({
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        type: 'local'
      });
    }
  });

  // 2. Search online with Nominatim if online
  if (navigator.onLine) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'Accept-Language': 'ko,en'
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        data.forEach((item: any) => {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          // Avoid adding duplicates from local offline search
          const isDup = results.some(r => Math.abs(r.lat - lat) < 0.05 && Math.abs(r.lng - lon) < 0.05);
          if (!isNaN(lat) && !isNaN(lon) && !isDup) {
            results.push({
              name: item.display_name,
              lat: lat,
              lng: lon,
              type: 'online'
            });
          }
        });
      }
    } catch (error) {
      console.warn('Online geocoding failed, using offline search only:', error);
    }
  }

  renderSearchResults(results);
};

const renderSearchResults = (results: SearchResult[]): void => {
  searchResults.innerHTML = '';

  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-result-empty">검색 결과가 없습니다.</div>`;
    searchResults.style.display = 'flex';
    return;
  }

  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    let displayName = result.name;
    if (displayName.length > 35) {
      displayName = displayName.substring(0, 32) + '...';
    }

    const typeLabel = result.type === 'local' ? '로컬' : '온라인';
    item.innerHTML = `
      <span class="result-type">${typeLabel}</span>
      <span class="result-name">${displayName}</span>
    `;

    item.addEventListener('click', () => {
      stopRotation();
      
      // Zoom camera to searched location
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(result.lng, result.lat, 25000.0), // 25km height for general view
        duration: 2.5
      });
      
      showToast(`${result.name}(으)로 이동합니다.`);
      
      // Clear and close search dropdown
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
      inputSearch.value = '';
      btnClearSearch.style.display = 'none';
    });

    searchResults.appendChild(item);
  });

  searchResults.style.display = 'flex';
};

// Load local GeoJSON country boundaries
const loadGeoJson = async (): Promise<void> => {
  try {
    const response = await fetch('/ne_110m_admin_0_countries.geojson');
    if (response.ok) {
      const geojson = await response.json();
      
      // Filter out Antarctica to prevent polar subdivision RangeError crashes in Cesium
      geojson.features = geojson.features.filter((feature: any) => {
        const name = feature.properties?.name;
        const iso = feature.properties?.iso_a3;
        return name !== 'Antarctica' && iso !== 'ATA';
      });
      
      countryFeatures = geojson.features;
      
      // Load boundaries into Cesium data source with styling
      await countriesDataSource.load(geojson, {
        stroke: Cesium.Color.TRANSPARENT, // Disable border drawing
        fill: Cesium.Color.fromCssColorString('rgba(255, 255, 255, 0.01)'), // Transparent fill
        clampToGround: true // Clamps polygons to the ellipsoid ground to render on top of imagery
      });
      
      // Force disable outlines to avoid WebGL subdivision RangeError on complex polygons
      countriesDataSource.entities.values.forEach(entity => {
        if (entity.polygon) {
          entity.polygon.outline = new Cesium.ConstantProperty(false);
        }
      });
      
      // Update highlights once boundary entities are fully loaded
      updateCountryHighlights();
    }
  } catch (error) {
    console.error('Failed to load local GeoJSON boundaries:', error);
  }
};
// --- Bottom Photo Gallery & Android Bridge Integration ---
interface GalleryPhoto {
  id: string;
  url: string;
  lat: number;
  lng: number;
  dateString: string;
}

// Global photo list (pre-populated with mock data for preview/testing)
let allPhotos: GalleryPhoto[] = [
  // Seoul Mock Photos (Unsplash)
  { id: 'p1', url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=300', lat: 37.5665, lng: 126.9780, dateString: '2026.05.01' },
  { id: 'p2', url: 'https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?w=300', lat: 37.5500, lng: 126.9900, dateString: '2026.05.02' },
  
  // Paris Mock Photos (Unsplash)
  { id: 'p3', url: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300', lat: 48.8566, lng: 2.3522, dateString: '2026.04.15' },
  { id: 'p4', url: 'https://images.unsplash.com/photo-1499856871958-5b9647a64dbd?w=300', lat: 48.8606, lng: 2.3376, dateString: '2026.04.16' },
  
  // New York Mock Photos (Unsplash)
  { id: 'p5', url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=300', lat: 40.7128, lng: -74.0060, dateString: '2026.03.10' },
  { id: 'p6', url: 'https://images.unsplash.com/photo-1522083165195-3427ee3f976d?w=300', lat: 40.7306, lng: -73.9352, dateString: '2026.03.12' },

  // Jeju Mock Photos (Unsplash)
  { id: 'p7', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300', lat: 33.4996, lng: 126.5312, dateString: '2026.05.15' }
];

// Photo Preview Helper Functions
const clearPhotoPreview = (): void => {
  activePhoto = null;
  selectedPinId = null;
  if (activePhotoPinEntity) {
    viewer.entities.remove(activePhotoPinEntity);
    activePhotoPinEntity = null;
  }
  const overlay = document.getElementById('photoPreviewOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  updateOverlayPosition();
};

const updateOverlayPosition = (): void => {
  // 1. Update active photo preview overlay
  const overlay = document.getElementById('photoPreviewOverlay');
  if (overlay) {
    let activePhotoUpdated = false;
    if (activePhoto) {
      const position = Cesium.Cartesian3.fromDegrees(activePhoto.lng, activePhoto.lat);
      
      let isVisible = true;
      if (viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
        const camera = viewer.scene.camera;
        const occluder = new (Cesium as any).EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camera.position);
        isVisible = occluder.isPointVisible(position);
      }
      
      if (isVisible) {
        const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(position);
        if (Cesium.defined(canvasPosition)) {
          overlay.style.display = 'block';
          overlay.style.left = `${canvasPosition.x}px`;
          overlay.style.top = `${canvasPosition.y}px`;
          overlay.style.zIndex = '11'; // Active temporary preview is on the absolute top
          activePhotoUpdated = true;
        }
      }
    }
    if (!activePhotoUpdated) {
      overlay.style.display = 'none';
    }
  }

  // 2. Update travel pin overlays
  const overlays = document.querySelectorAll('.travel-pin-overlay');
  overlays.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const pinId = htmlEl.getAttribute('data-pin-id');
    if (!pinId) return;

    const pin = pins.find(p => p.id === pinId);
    if (pin && pin.photoUrl) {
      const position = Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat);
      
      let isVisible = true;
      if (viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
        const camera = viewer.scene.camera;
        const occluder = new (Cesium as any).EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camera.position);
        isVisible = occluder.isPointVisible(position);
      }

      if (isVisible) {
        const canvasPosition = viewer.scene.cartesianToCanvasCoordinates(position);
        if (Cesium.defined(canvasPosition)) {
          htmlEl.style.display = 'block';
          htmlEl.style.left = `${canvasPosition.x}px`;
          htmlEl.style.top = `${canvasPosition.y}px`;
          
          if (pinId === selectedPinId) {
            htmlEl.style.zIndex = '10'; // Selected pin is on top of other travel pins
            htmlEl.classList.add('selected');
          } else {
            htmlEl.style.zIndex = '8'; // Standard travel pins
            htmlEl.classList.remove('selected');
          }
          return;
        }
      }
    }
    htmlEl.style.display = 'none';
  });
};

const showPhotoPreview = (photo: GalleryPhoto): void => {
  activePhoto = photo;

  // Clear previous photo pin entity if it exists
  if (activePhotoPinEntity) {
    viewer.entities.remove(activePhotoPinEntity);
  }

  // Create new cyan pin entity at the photo's coordinate
  activePhotoPinEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(photo.lng, photo.lat),
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString('#06b6d4'), // Bright Cyan
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });

  // Update HTML elements in the overlay
  const overlayImg = document.getElementById('previewOverlayImg') as HTMLImageElement;
  const overlayDate = document.getElementById('previewOverlayDate') as HTMLSpanElement;
  const overlay = document.getElementById('photoPreviewOverlay') as HTMLDivElement;

  if (overlayImg && overlayDate && overlay) {
    overlayImg.src = photo.url;
    overlayDate.textContent = photo.dateString;
    
    // Reset animation
    overlay.style.display = 'none';
    void overlay.offsetWidth; // trigger reflow
    overlay.style.display = 'block';
    
    // Position immediately
    updateOverlayPosition();
  }
};

const openModalWithPhoto = (photo: GalleryPhoto): void => {
  inputLat.value = photo.lat.toFixed(6);
  inputLng.value = photo.lng.toFixed(6);
  inputTitle.value = '';
  inputDesc.value = '';
  
  if (inputPhotoUrl && formPhotoPreview && formPreviewImg) {
    inputPhotoUrl.value = photo.url;
    formPreviewImg.src = photo.url;
    formPhotoPreview.style.display = 'flex';
  }
  
  if (inputPhotoFile) {
    inputPhotoFile.value = '';
  }

  disableAddPinMode();
  openModal();
};

// Wire up the close button
const btnClosePreview = document.getElementById('btnClosePreview') as HTMLButtonElement;
if (btnClosePreview) {
  btnClosePreview.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPhotoPreview();
  });
}

// Wire up clicking on the polaroid frame to drop a footprint / open modal
const polaroidFrame = document.querySelector('.polaroid-frame') as HTMLDivElement;
if (polaroidFrame) {
  polaroidFrame.addEventListener('click', (e) => {
    // If the close button was clicked, do not trigger the modal opening
    if ((e.target as HTMLElement).closest('.btn-close-preview')) return;
    if (activePhoto) {
      openModalWithPhoto(activePhoto);
    }
  });
}

// Track viewport and position overlay on render tick
viewer.scene.postRender.addEventListener(updateOverlayPosition);

// DOM references for Photo Gallery Drawer
const photoGalleryDrawer = document.getElementById('photoGalleryDrawer') as HTMLDivElement;
const photoGalleryContent = document.getElementById('photoGalleryContent') as HTMLDivElement;
const photoCountEl = document.getElementById('photoCount') as HTMLSpanElement;
const travelPinOverlaysContainer = document.getElementById('travelPinOverlaysContainer') as HTMLDivElement;

// Expose global window interface for Android Webview to push actual photos
declare global {
  interface Window {
    onGalleryPhotosLoaded: (photosJson: string) => void;
  }
}

window.onGalleryPhotosLoaded = (photosJson: string): void => {
  try {
    const photos = JSON.parse(photosJson);
    if (Array.isArray(photos)) {
      allPhotos = photos;
      updateVisiblePhotos();
      showToast(`성공: 갤러리 사진 ${photos.length}장을 동기화했습니다. 📸`);
    }
  } catch (err) {
    console.error('Failed to parse native photos JSON', err);
  }
};

// Filter and render photos that exist within the current map viewport bounds
const updateVisiblePhotos = (): void => {
  if (!allPhotos || allPhotos.length === 0) {
    photoGalleryDrawer.classList.remove('active');
    return;
  }

  const rect = viewer.camera.computeViewRectangle();
  if (!rect) {
    photoGalleryDrawer.classList.remove('active');
    return;
  }

  // Convert radians to degrees
  const west = Cesium.Math.toDegrees(rect.west);
  const east = Cesium.Math.toDegrees(rect.east);
  const south = Cesium.Math.toDegrees(rect.south);
  const north = Cesium.Math.toDegrees(rect.north);

  // Filter photos within visible bounds (handling simple boundary wraps)
  const visiblePhotos = allPhotos.filter(photo => {
    const lngMatch = east >= west
      ? (photo.lng >= west && photo.lng <= east)
      : (photo.lng >= west || photo.lng <= east);
    
    return lngMatch && photo.lat >= south && photo.lat <= north;
  });

  if (visiblePhotos.length === 0) {
    photoGalleryDrawer.classList.remove('active');
    return;
  }

  // Render cards
  photoCountEl.textContent = visiblePhotos.length.toString();
  photoGalleryContent.innerHTML = '';

  visiblePhotos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-thumb-card';
    card.innerHTML = `
      <img src="${photo.url}" alt="Gallery thumbnail" />
      <span class="photo-date">${photo.dateString}</span>
    `;

    // Zoom camera on card click, and if clicked again, open add pin modal
    card.addEventListener('click', () => {
      if (activePhoto && activePhoto.id === photo.id) {
        openModalWithPhoto(photo);
      } else {
        stopRotation();
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(photo.lng, photo.lat, 1000.0), // Zoom in very close (1km)
          duration: 2.0
        });
        showToast(`사진 촬영 장소로 이동했습니다. 한번 더 누르면 발자국을 남깁니다! 📍`);
        showPhotoPreview(photo);
      }
    });

    photoGalleryContent.appendChild(card);
  });

  photoGalleryDrawer.classList.add('active');
};

// Listen to Cesium camera moveEnd to trigger viewpoint photo updates
viewer.camera.moveEnd.addEventListener(updateVisiblePhotos);


// Photo previews toggle listener
const chkShowPhotoPreviews = document.getElementById('chkShowPhotoPreviews') as HTMLInputElement;
if (chkShowPhotoPreviews) {
  chkShowPhotoPreviews.checked = isShowPhotoPreviews;
  chkShowPhotoPreviews.addEventListener('change', () => {
    isShowPhotoPreviews = chkShowPhotoPreviews.checked;
    localStorage.setItem('show_photo_previews', isShowPhotoPreviews ? 'true' : 'false');
    
    // Refresh pins rendering
    renderPinsOnGlobe();
    updateOverlayPosition();
    showToast(isShowPhotoPreviews ? '사진 프레임이 활성화되었습니다. 📸' : '사진 프레임이 비활성화되었습니다. 📍');
  });
}

// 10. Initial Setup Execution
loadPins();
renderPinsOnGlobe();
updateSidebarList();
loadGeoJson();

// Showcase initial welcoming message
setTimeout(() => {
  showToast('지도 위에서 자유롭게 여행지를 찾아보세요! 🗺️');
}, 1000);

