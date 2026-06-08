// Define global window type extension for Cesium base url before any imports
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}
window.CESIUM_BASE_URL = '/cesium/';

import * as Cesium from 'cesium';
import { registerPlugin, Capacitor } from '@capacitor/core';
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
const galleryDataSource = new Cesium.CustomDataSource('gallery-photos');
let activePhoto: GalleryPhoto | null = null;
let activePhotoPinEntity: Cesium.Entity | null = null;
let selectedPinId: string | null = null;
let myLocationEntity: Cesium.Entity | null = null;
let myLocationLat: number | null = null;
let myLocationLng: number | null = null;
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

// Mobile Sidebar DOM Elements
const sidebarEl = document.getElementById('sidebar') as HTMLElement;
const btnSidebarToggle = document.getElementById('btnSidebarToggle') as HTMLButtonElement;
const btnSidebarClose = document.getElementById('btnSidebarClose') as HTMLButtonElement;
const sidebarBackdrop = document.getElementById('sidebarBackdrop') as HTMLDivElement;
const btnMyLocation = document.getElementById('btnMyLocation') as HTMLButtonElement;

function closeMobileSidebar(): void {
  if (sidebarEl && sidebarBackdrop) {
    sidebarEl.classList.remove('active');
    sidebarBackdrop.classList.remove('active');
  }
}

// Recent Gallery Sidebar Elements
const recentGallerySection = document.getElementById('recentGallerySection') as HTMLElement | null;
const recentGalleryList = document.getElementById('recentGalleryList') as HTMLElement | null;

// Gallery Debug Card Elements
const debugPlatform = document.getElementById('debugPlatform') as HTMLSpanElement | null;
const debugPermission = document.getElementById('debugPermission') as HTMLSpanElement | null;
const debugPhotoCount = document.getElementById('debugPhotoCount') as HTMLSpanElement | null;
const debugStatus = document.getElementById('debugStatus') as HTMLSpanElement | null;
const debugErrorContainer = document.getElementById('debugErrorContainer') as HTMLElement | null;
const debugError = document.getElementById('debugError') as HTMLSpanElement | null;

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
viewer.dataSources.add(galleryDataSource);

// Setup gallery clustering properties
galleryDataSource.clustering.enabled = true;
galleryDataSource.clustering.pixelRange = 50;
galleryDataSource.clustering.minimumClusterSize = 2;

// Cache for clustered thumbnails canvas dataURL
const clusterBillboardCache = new Map<string, string>();

function getOrCreateClusterBillboard(clusterKey: string, imageUrl: string, count: number): Promise<string> {
  if (clusterBillboardCache.has(clusterKey)) {
    return Promise.resolve(clusterBillboardCache.get(clusterKey)!);
  }

  return new Promise((resolve) => {
    const size = 64; // Clustered bubble is slightly larger than single bubble
    const borderRadius = 8;
    const canvas = document.createElement('canvas');
    canvas.width = size + 16; // Extra padding for top-right numeric badge
    canvas.height = size + 22; // Extra height for pointer triangle
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(canvas.toDataURL());
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      
      // 1. Draw bubble pointer pin shape
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(8, 8, size, size, borderRadius);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(size / 2 + 8 - 8, size + 8);
      ctx.lineTo(size / 2 + 8 + 8, size + 8);
      ctx.lineTo(size / 2 + 8, size + 14);
      ctx.closePath();
      ctx.fill();
      
      // 2. Clip and draw image inside
      ctx.beginPath();
      const pad = 3;
      ctx.roundRect(8 + pad, 8 + pad, size - pad * 2, size - pad * 2, borderRadius - 2);
      ctx.clip();
      
      const aspect = img.width / img.height;
      let drawW = size - pad * 2;
      let drawH = size - pad * 2;
      let startX = 8 + pad;
      let startY = 8 + pad;
      if (aspect > 1) {
        drawW = (size - pad * 2) * aspect;
        startX = 8 + pad - (drawW - (size - pad * 2)) / 2;
      } else {
        drawH = (size - pad * 2) / aspect;
        startY = 8 + pad - (drawH - (size - pad * 2)) / 2;
      }
      ctx.drawImage(img, startX, startY, drawW, drawH);
      
      ctx.restore(); // Restore context to draw numeric badge on top of clip mask

      // 3. Draw Count Badge on top-right corner of the bubble
      ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(size + 4, 12, 11, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), size + 4, 12);
      
      const dataUrl = canvas.toDataURL();
      clusterBillboardCache.set(clusterKey, dataUrl);
      resolve(dataUrl);
    };
    img.onerror = () => {
      // Fallback: draw generic circle badge if image fails to load
      ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 20, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), canvas.width / 2, canvas.height / 2);
      
      const dataUrl = canvas.toDataURL();
      clusterBillboardCache.set(clusterKey, dataUrl);
      resolve(dataUrl);
    };
    img.src = imageUrl;
  });
}

// Dynamic pastel cluster icon canvas helper returning data URL string
function createClusterIconCanvas(count: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(24, 24, 18, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
    ctx.beginPath();
    ctx.arc(24, 24, 15, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), 24, 24);
  }
  return canvas.toDataURL();
}

galleryDataSource.clustering.clusterEvent.addEventListener((entities, cluster) => {
  cluster.label.show = false;
  cluster.billboard.show = true;
  cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;

  const count = entities.length;
  // Sort IDs to make a stable cluster cache key
  const sortedIds = entities.map(e => e.id).sort().join(',');

  // Search for the first valid photo URL in this cluster from the cached allPhotos
  let photoUrl = '';
  for (const ent of entities) {
    const foundPhoto = allPhotos.find(p => p.id === ent.id);
    if (foundPhoto && foundPhoto.url) {
      photoUrl = foundPhoto.url;
      break;
    }
  }

  if (photoUrl) {
    if (clusterBillboardCache.has(sortedIds)) {
      cluster.billboard.image = clusterBillboardCache.get(sortedIds)!;
      cluster.billboard.width = 80;  // size 64 + padding 16
      cluster.billboard.height = 86; // size 64 + padding 22
    } else {
      // Use fallback circle badge while loading
      cluster.billboard.image = createClusterIconCanvas(count);
      cluster.billboard.width = 48;
      cluster.billboard.height = 48;
      
      // Load cluster micro-thumbnail asynchronously, then trigger redraw
      void getOrCreateClusterBillboard(sortedIds, photoUrl, count).then(() => {
        viewer.scene.requestRender();
      });
    }
  } else {
    cluster.billboard.image = createClusterIconCanvas(count);
    cluster.billboard.width = 48;
    cluster.billboard.height = 48;
  }
});

// Cache for photos billboard canvas
const billboardCache = new Map<string, HTMLCanvasElement>();

function getOrCreatePhotoBillboard(photoId: string, url: string): Promise<HTMLCanvasElement> {
  if (billboardCache.has(photoId)) {
    return Promise.resolve(billboardCache.get(photoId)!);
  }
  
  return new Promise((resolve) => {
    const size = 56;
    const borderRadius = 8;
    const canvas = document.createElement('canvas');
    canvas.width = size + 6;
    canvas.height = size + 12; // Extra height for pointer triangle
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(canvas);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(3, 3, size, size, borderRadius);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(size / 2 + 3 - 6, size + 3);
      ctx.lineTo(size / 2 + 3 + 6, size + 3);
      ctx.lineTo(size / 2 + 3, size + 9);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      const pad = 3;
      ctx.roundRect(3 + pad, 3 + pad, size - pad * 2, size - pad * 2, borderRadius - 2);
      ctx.clip();
      
      const aspect = img.width / img.height;
      let drawW = size - pad * 2;
      let drawH = size - pad * 2;
      let startX = 3 + pad;
      let startY = 3 + pad;
      if (aspect > 1) {
        drawW = (size - pad * 2) * aspect;
        startX = 3 + pad - (drawW - (size - pad * 2)) / 2;
      } else {
        drawH = (size - pad * 2) / aspect;
        startY = 3 + pad - (drawH - (size - pad * 2)) / 2;
      }
      ctx.drawImage(img, startX, startY, drawW, drawH);
      ctx.restore();
      billboardCache.set(photoId, canvas);
      resolve(canvas);
    };
    img.onerror = () => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(3, 3, size, size, borderRadius);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(size / 2 + 3 - 6, size + 3);
      ctx.lineTo(size / 2 + 3 + 6, size + 3);
      ctx.lineTo(size / 2 + 3, size + 9);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#06b6d4';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📸', size / 2 + 3, size / 2 + 3);
      resolve(canvas);
    };
    img.src = url;
  });
}

let defaultGalleryIconCanvas: HTMLCanvasElement | null = null;
function getDefaultGalleryIconCanvas(): HTMLCanvasElement {
  if (defaultGalleryIconCanvas) return defaultGalleryIconCanvas;
  
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2 - 2, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(size / 2 - 4, size / 2 + 4);
    ctx.lineTo(size / 2 + 4, size / 2 + 4);
    ctx.lineTo(size / 2, size / 2 + 9);
    ctx.closePath();
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#06b6d4';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📸', size / 2, size / 2 - 2);
  }
  defaultGalleryIconCanvas = canvas;
  return canvas;
}



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
  // Clear existing non-gallery entities
  viewer.entities.removeAll();
  
  // Clear existing gallery data source entities
  galleryDataSource.entities.removeAll();

  // Clear existing travel pin DOM overlays
  if (travelPinOverlaysContainer) {
    travelPinOverlaysContainer.innerHTML = '';
  }

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

  // Re-add My Location marker if it exists
  if (myLocationLat !== null && myLocationLng !== null) {
    myLocationEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(myLocationLng, myLocationLat),
      point: {
        pixelSize: 14,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  } else {
    myLocationEntity = null;
  }

  // Add gallery photos to the clustered galleryDataSource
  allPhotos.forEach((photo) => {
    if (photo.hasLocation === false) return; // Skip photos without location

    const position = Cesium.Cartesian3.fromDegrees(photo.lng, photo.lat);
    galleryDataSource.entities.add({
      id: photo.id, // e.g. "gp_123"
      position: position,
      billboard: {
        image: getDefaultGalleryIconCanvas(), // default camera pin representation
        width: 32,
        height: 32,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  });

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
  // Trigger viewport photo loading
  void updateVisibleGalleryThumbnails();
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
      closeMobileSidebar();
      zoomToPin(pin);
      const date = new Date(pin.createdAt);
      const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      showPhotoPreview({
        id: pin.id,
        url: pin.photoUrl || '',
        lat: pin.lat,
        lng: pin.lng,
        dateString: pin.photoUrl ? dateString : pin.title
      });
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

const updateDebugCard = (platform: string, permission: string, count: number, statusStr: string, errorMsg?: string): void => {
  if (debugPlatform) debugPlatform.textContent = platform;
  if (debugPermission) {
    debugPermission.textContent = permission;
    if (permission.includes('GRANTED')) {
      debugPermission.className = 'status-granted';
    } else if (permission.includes('DENIED') || permission.includes('거부') || permission.includes('오류')) {
      debugPermission.className = 'status-denied';
    } else {
      debugPermission.className = 'status-neutral';
    }
  }
  if (debugPhotoCount) debugPhotoCount.textContent = `${count}장`;
  if (debugStatus) {
    debugStatus.textContent = statusStr;
  }
  if (debugErrorContainer && debugError) {
    if (errorMsg) {
      debugError.textContent = errorMsg;
      debugErrorContainer.style.display = 'block';
    } else {
      debugErrorContainer.style.display = 'none';
    }
  }
};

const updateRecentGallerySidebar = (): void => {
  if (!recentGallerySection || !recentGalleryList) return;

  if (!allPhotos || allPhotos.length === 0) {
    recentGallerySection.style.display = 'none';
    return;
  }

  recentGallerySection.style.display = 'block';
  recentGalleryList.innerHTML = '';

  // Get the 10 most recent photos (photos are already sorted by DATE_TAKEN DESC in performScan)
  const recentPhotos = allPhotos.slice(0, 10);

  recentPhotos.forEach(photo => {
    const isNoGps = photo.hasLocation === false;
    const item = document.createElement('div');
    item.className = 'recent-gallery-item' + (isNoGps ? ' no-gps' : '');
    item.innerHTML = `
      <img src="${photo.url}" alt="Recent photo" />
      ${isNoGps ? '<span class="gps-badge">No GPS</span>' : ''}
    `;
    
    // Zoom and show preview on click
    item.addEventListener('click', () => {
      if (isNoGps) {
        showToast('이 사진은 위치 정보(GPS)가 없어 지도상에 이동할 수 없습니다. 📸');
        return;
      }
      stopRotation();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(photo.lng, photo.lat, 1000.0),
        duration: 2.0
      });
      showPhotoPreview(photo);
      showToast(`최근 사진 촬영 장소로 이동했습니다! 📸`);
    });

    recentGalleryList.appendChild(item);
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
  closeMobileSidebar();
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
        const date = new Date(clickedPin.createdAt);
        const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        showPhotoPreview({
          id: clickedPin.id,
          url: clickedPin.photoUrl || '',
          lat: clickedPin.lat,
          lng: clickedPin.lng,
          dateString: clickedPin.photoUrl ? dateString : clickedPin.title
        });
      } else {
        // Check if it's a gallery photo pin
        const clickedPhoto = allPhotos.find(p => p.id === pickedObject.id.id);
        if (clickedPhoto) {
          stopRotation();
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(clickedPhoto.lng, clickedPhoto.lat, 1000.0),
            duration: 2.0
          });
          showPhotoPreview(clickedPhoto);
          showToast('사진첩 이미지를 선택했습니다. 카드를 눌러 발자국을 등록해보세요! 📸');
        } else if (activePhotoPinEntity && pickedObject.id === activePhotoPinEntity && activePhoto) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(activePhoto.lng, activePhoto.lat, 1000.0),
            duration: 1.5
          });
        }
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
      closeMobileSidebar();
      
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
  hasLocation?: boolean;
}

interface GalleryScannerPluginType {
  scanGallery(): Promise<{ photos: GalleryPhoto[] }>;
}

const GalleryScanner = registerPlugin<GalleryScannerPluginType>('GalleryScanner');

const scanGalleryPhotos = async (): Promise<void> => {
  const currentPlatform = Capacitor.getPlatform();
  if (currentPlatform === 'web') {
    console.log('Running on web. Keeping mock photos.');
    updateDebugCard('web (브라우저)', 'N/A (웹 환경)', allPhotos.length, '모의 사진 사용 중 (웹)');
    return;
  }

  updateDebugCard(currentPlatform, '확인 중...', 0, '네이티브 권한 확인 중...');

  try {
    showToast('기기 갤러리에서 사진을 동기화하는 중... 📸');
    const result = await GalleryScanner.scanGallery();
    if (result.photos && result.photos.length > 0) {
      allPhotos = result.photos.map(photo => ({
        ...photo,
        url: Capacitor.convertFileSrc(photo.url)
      }));
      updateVisiblePhotos();
      updateRecentGallerySidebar();
      renderPinsOnGlobe(); // Render gallery photo pins directly on the map
      showToast(`성공: 갤러리 사진 ${allPhotos.length}장을 동기화했습니다. 📸`);
      updateDebugCard(currentPlatform, 'GRANTED (허용됨)', allPhotos.length, '사진 동기화 성공! 📸');
    } else {
      showToast('갤러리에 사진이 한 장도 없습니다. 📸');
      updateDebugCard(currentPlatform, 'GRANTED (허용됨)', 0, '갤러리가 비어 있습니다. (사진 0장)');
    }
  } catch (err: any) {
    console.error('Failed to scan gallery photos:', err);
    showToast('갤러리 접근 권한이 필요합니다. 🔒');
    let errorString = err?.message || String(err);
    updateDebugCard(currentPlatform, 'DENIED (거부됨) 또는 오류 ❌', 0, '동기화 실패', errorString);
  }
};

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
  const imgWrapper = overlay?.querySelector('.polaroid-img-wrapper') as HTMLDivElement;
  const frame = overlay?.querySelector('.polaroid-frame') as HTMLDivElement;

  if (overlayImg && overlayDate && overlay) {
    if (photo.url) {
      overlayImg.src = photo.url;
      if (imgWrapper) imgWrapper.style.display = 'block';
      if (frame) frame.classList.remove('no-photo');
    } else {
      overlayImg.src = '';
      if (imgWrapper) imgWrapper.style.display = 'none';
      if (frame) frame.classList.add('no-photo');
    }
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
    if (selectedPinId && pins.some(p => p.id === selectedPinId)) {
      const confirmDelete = confirm('이 발자취(여행 기록)를 정말로 삭제하시겠습니까?');
      if (confirmDelete) {
        deletePin(selectedPinId);
      }
    }
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
  const currentPlatform = Capacitor.getPlatform();
  try {
    const photos = JSON.parse(photosJson);
    if (Array.isArray(photos)) {
      allPhotos = photos;
      updateVisiblePhotos();
      updateRecentGallerySidebar();
      showToast(`성공: 갤러리 사진 ${photos.length}장을 동기화했습니다. 📸`);
      updateDebugCard(currentPlatform, 'GRANTED (허용됨)', allPhotos.length, '브릿지 수신 성공! 📸');
    }
  } catch (err: any) {
    console.error('Failed to parse native photos JSON', err);
    let errorString = err?.message || String(err);
    updateDebugCard(currentPlatform, 'GRANTED (허용됨)', 0, '브릿지 수신 후 파싱 에러 ❌', errorString);
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
    if (photo.hasLocation === false) return false; // Skip photos without GPS
    
    const lngMatch = east >= west
      ? (photo.lng >= west && photo.lng <= east)
      : (photo.lng >= west || photo.lng <= east);
    
    return lngMatch && photo.lat >= south && photo.lat <= north;
  });

  if (visiblePhotos.length === 0) {
    photoGalleryDrawer.classList.remove('active');
    return;
  }

  // Randomly select up to 10 photos
  const shuffled = [...visiblePhotos].sort(() => 0.5 - Math.random());
  const selectedPhotos = shuffled.slice(0, 10);

  // Render cards
  photoCountEl.textContent = `${selectedPhotos.length}장 (총 ${visiblePhotos.length}장)`;
  photoGalleryContent.innerHTML = '';

  selectedPhotos.forEach(photo => {
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

const updateVisibleGalleryThumbnails = async (): Promise<void> => {
  if (!isShowPhotoPreviews) {
    // If previews are disabled, clear custom textures back to default 32x32 camera icons
    galleryDataSource.entities.values.forEach(entity => {
      if (entity.billboard && entity.billboard.image && entity.billboard.image.getValue(Cesium.JulianDate.now()) !== getDefaultGalleryIconCanvas()) {
        entity.billboard.image = new Cesium.ConstantProperty(getDefaultGalleryIconCanvas());
        entity.billboard.width = new Cesium.ConstantProperty(32);
        entity.billboard.height = new Cesium.ConstantProperty(32);
      }
    });
    return;
  }

  const cameraHeight = viewer.camera.positionCartographic.height;
  const maxLoadHeight = 5000000; // 5,000km

  if (cameraHeight >= maxLoadHeight) {
    galleryDataSource.entities.values.forEach(entity => {
      if (entity.billboard && entity.billboard.image && entity.billboard.image.getValue(Cesium.JulianDate.now()) !== getDefaultGalleryIconCanvas()) {
        entity.billboard.image = new Cesium.ConstantProperty(getDefaultGalleryIconCanvas());
        entity.billboard.width = new Cesium.ConstantProperty(32);
        entity.billboard.height = new Cesium.ConstantProperty(32);
      }
    });
    return;
  }

  const rect = viewer.camera.computeViewRectangle();
  if (!rect) return;

  const west = Cesium.Math.toDegrees(rect.west);
  const east = Cesium.Math.toDegrees(rect.east);
  const south = Cesium.Math.toDegrees(rect.south);
  const north = Cesium.Math.toDegrees(rect.north);

  // Filter entities within current viewport
  const visibleEntities = galleryDataSource.entities.values.filter(entity => {
    const pos = entity.position?.getValue(Cesium.JulianDate.now());
    if (!pos) return false;
    const carto = Cesium.Cartographic.fromCartesian(pos);
    const lng = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);

    const lngMatch = east >= west
      ? (lng >= west && lng <= east)
      : (lng >= west || lng <= east);

    return lngMatch && lat >= south && lat <= north;
  });

  // Limit processing count inside current view frame for extreme performance
  const limitCount = 40;
  const targetEntities = visibleEntities.slice(0, limitCount);

  // Revert out-of-bounds or excess entities back to the standard small icon
  galleryDataSource.entities.values.forEach(entity => {
    if (!targetEntities.includes(entity)) {
      if (entity.billboard && entity.billboard.image && entity.billboard.image.getValue(Cesium.JulianDate.now()) !== getDefaultGalleryIconCanvas()) {
        entity.billboard.image = new Cesium.ConstantProperty(getDefaultGalleryIconCanvas());
        entity.billboard.width = new Cesium.ConstantProperty(32);
        entity.billboard.height = new Cesium.ConstantProperty(32);
      }
    }
  });

  // Load micro-cached photo frames in background concurrently
  for (const entity of targetEntities) {
    const photoId = entity.id;
    const photo = allPhotos.find(p => p.id === photoId);
    if (photo && entity.billboard && entity.billboard.image) {
      const currentImg = entity.billboard.image.getValue(Cesium.JulianDate.now());
      if (currentImg && currentImg !== getDefaultGalleryIconCanvas()) {
        continue; // already loaded/cached
      }

      const canvas = await getOrCreatePhotoBillboard(photo.id, photo.url);
      // Ensure entity is still present before updating
      if (galleryDataSource.entities.getById(photoId)) {
        entity.billboard.image = new Cesium.ConstantProperty(canvas);
        entity.billboard.width = new Cesium.ConstantProperty(62);
        entity.billboard.height = new Cesium.ConstantProperty(68);
      }
    }
  }
};

viewer.camera.moveEnd.addEventListener(updateVisibleGalleryThumbnails);


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
    void updateVisibleGalleryThumbnails();
    showToast(isShowPhotoPreviews ? '사진 프레임이 활성화되었습니다. 📸' : '사진 프레임이 비활성화되었습니다. 📍');
  });
}

// Mobile Sidebar Event Listeners
if (btnSidebarToggle) {
  btnSidebarToggle.addEventListener('click', () => {
    sidebarEl.classList.add('active');
    sidebarBackdrop.classList.add('active');
  });
}

if (btnSidebarClose) {
  btnSidebarClose.addEventListener('click', closeMobileSidebar);
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener('click', closeMobileSidebar);
}

// My Location tracking logic and marker setup
const updateMyLocationMarker = (lat: number, lng: number): void => {
  myLocationLat = lat;
  myLocationLng = lng;
  const position = Cesium.Cartesian3.fromDegrees(lng, lat);
  
  if (myLocationEntity && viewer.entities.contains(myLocationEntity)) {
    myLocationEntity.position = position as any;
  } else {
    myLocationEntity = viewer.entities.add({
      position: position,
      point: {
        pixelSize: 14,
        color: Cesium.Color.RED, // Simple red dot
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY // Keep visible on top
      }
    });
  }
};

const startTrackingLocation = (): void => {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        updateMyLocationMarker(lat, lng);
      },
      (error) => {
        console.error('Error tracking location:', error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }
};

// My Location Click Handler (HTML5 Geolocation API)
if (btnMyLocation) {
  btnMyLocation.addEventListener('click', () => {
    showToast('현재 위치를 조회하고 있습니다... 📡');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        updateMyLocationMarker(lat, lng);
        
        stopRotation();
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lng, lat, 1000.0), // Fly to 1km height (matches image click)
          duration: 2.5
        });
        showToast('현재 위치로 이동했습니다! 📍');
      },
      (error) => {
        console.error('Error getting geolocation:', error);
        showToast('현재 위치를 가져올 수 없습니다. GPS 설정과 권한을 확인해주세요. 🔒');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// 10. Initial Setup Execution
const initApp = async (): Promise<void> => {
  loadPins();
  renderPinsOnGlobe();
  updateSidebarList();
  updateRecentGallerySidebar();
  await loadGeoJson();
  
  // 1. Scan gallery photos first (requests photo/media permissions)
  await scanGalleryPhotos();
  
  // 2. Start tracking device location (requests GPS location permissions)
  startTrackingLocation();
  
  // Showcase initial welcoming message
  setTimeout(() => {
    showToast('지도 위에서 자유롭게 여행지를 찾아보세요! 🗺️');
  }, 1000);
};

void initApp();

