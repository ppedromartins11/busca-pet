import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const DEMO_MAP_POINTS = Object.freeze([
  Object.freeze({ id: "demo-last-known", category: "last-known", latitude: -20.4707, longitude: -54.6205, title: "Última região conhecida: Vila Ilustrativa", region: "Vila Ilustrativa, Campo Grande/MS", time: "21/10/2026, 08:30", description: "Local aproximado informado antes do desaparecimento de Amora, animal demonstrativo.", state: "Demonstração" }),
  Object.freeze({ id: "demo-sighting-1", category: "sighting", latitude: -20.4625, longitude: -54.6108, title: "Avistamento demonstrativo 1", region: "Região Norte, Campo Grande/MS", time: "21/10/2026, 09:10", description: "Pessoa fictícia relatou ter visto um animal semelhante perto de uma praça.", state: "Demonstração" }),
  Object.freeze({ id: "demo-sighting-2", category: "sighting", latitude: -20.4794, longitude: -54.6321, title: "Avistamento demonstrativo 2", region: "Região Central, Campo Grande/MS", time: "21/10/2026, 10:25", description: "Relato fictício de passagem por uma área comercial, sem confirmação.", state: "Demonstração" }),
  Object.freeze({ id: "demo-sighting-3", category: "sighting", latitude: -20.4883, longitude: -54.6174, title: "Avistamento demonstrativo 3", region: "Região Sul, Campo Grande/MS", time: "21/10/2026, 12:05", description: "Relato fictício mais recente para demonstrar a ordenação temporal.", state: "Demonstração" }),
  Object.freeze({ id: "demo-support-1", category: "support", latitude: -20.4564, longitude: -54.6269, title: "Ponto de apoio comunitário fictício", region: "Região Oeste, Campo Grande/MS", description: "Ponto demonstrativo de distribuição de avisos e orientação comunitária.", state: "Demonstração" }),
  Object.freeze({ id: "demo-support-2", category: "partner", latitude: -20.4742, longitude: -54.6014, title: "Estabelecimento parceiro fictício", region: "Região Leste, Campo Grande/MS", description: "Exemplo fictício de parceiro autorizado para divulgação. Sem contato real.", state: "Demonstração" }),
]);

const categoryMeta = Object.freeze({
  "last-known": { label: "Última região conhecida", symbol: "⌖", className: "last-known" },
  sighting: { label: "Avistamento", symbol: "◉", className: "sighting" },
  support: { label: "Rede de apoio", symbol: "♥", className: "support" },
  partner: { label: "Parceiro", symbol: "✦", className: "partner" },
});

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function markerIcon(point) {
  const meta = categoryMeta[point.category];
  return L.divIcon({
    className: "bp-map-icon-wrap",
    html: `<span class="bp-map-icon ${meta.className}" aria-hidden="true">${meta.symbol}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function popup(point) {
  const meta = categoryMeta[point.category];
  const detail = /^[0-9a-f-]{36}$/i.test(point.occurrenceId || "")
    ? `<a href="#pet/${encodeURIComponent(point.occurrenceId)}">Ver alerta</a>` : "";
  return `<article class="bp-map-popup"><p>${escape(meta.label)}${point.state ? ` · ${escape(point.state)}` : ""}</p><h2>${escape(point.title)}</h2><p>${escape(point.region)}</p>${point.time ? `<time>${escape(point.time)}</time>` : ""}<p>${escape(point.description || "")}</p>${point.radius_m ? `<p>Área aproximada: raio de ${escape(point.radius_m)} m</p>` : ""}${detail}</article>`;
}

export function createSearchMap(container, { onTilesError } = {}) {
  const map = L.map(container, { zoomControl: true, keyboard: true, scrollWheelZoom: true, preferCanvas: true });
  const markers = new Map();
  const circles = [];
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
    crossOrigin: true,
  }).addTo(map);
  let tilesFailed = false;
  tiles.on("tileerror", () => {
    if (!tilesFailed) { tilesFailed = true; onTilesError?.(); }
  });
  map.setView([-20.4697, -54.6201], 12);

  return {
    setPoints(points, filters = {}, { fit = true } = {}) {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      circles.forEach((circle) => circle.remove());
      circles.length = 0;
      const visible = points.filter((point) => filters[point.category] !== false);
      for (const point of visible) {
        const marker = L.marker([point.latitude, point.longitude], {
          icon: markerIcon(point), title: `${categoryMeta[point.category].label}: ${point.title}`, alt: `${categoryMeta[point.category].label}: ${point.title}`, keyboard: true,
        }).addTo(map).bindPopup(popup(point), { maxWidth: 300, autoPanPadding: [24, 24] });
        markers.set(point.id, marker);
        if (point.radius_m) circles.push(L.circle([point.latitude, point.longitude], {
          radius: point.radius_m, color: categoryMeta[point.category].className === "sighting" ? "#236caf" : "#b63838",
          fillOpacity: 0.11, weight: 1, interactive: false,
        }).addTo(map));
      }
      if (fit && visible.length) map.fitBounds(L.latLngBounds(visible.map((point) => [point.latitude, point.longitude])), { padding: [32, 32], maxZoom: 14, animate: false });
      else if (fit && !visible.length) map.setView([-15.8, -51.9], 4, { animate: false });
    },
    getSearchArea() {
      const center = map.getCenter();
      const radius_m = Math.ceil(center.distanceTo(map.getBounds().getNorthEast()));
      return radius_m <= 500000 ? { latitude: center.lat, longitude: center.lng, radius_m: Math.max(1000, radius_m) } : null;
    },
    focus(pointId) {
      const marker = markers.get(pointId);
      if (!marker) return false;
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 14), { animate: false });
      marker.openPopup();
      return true;
    },
    locate({ onSuccess, onError }) {
      if (!navigator.geolocation) { onError?.("A geolocalização não é compatível com este navegador."); return; }
      navigator.geolocation.getCurrentPosition((position) => {
        const location = L.latLng(position.coords.latitude, position.coords.longitude);
        map.setView(location, Math.max(map.getZoom(), 14), { animate: false });
        L.circleMarker(location, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#683bb4", fillOpacity: 1, interactive: false }).addTo(map);
        onSuccess?.();
      }, (error) => onError?.(error.code === error.PERMISSION_DENIED ? "A localização não foi compartilhada. Você ainda pode navegar pelo mapa manualmente." : "Não foi possível obter sua localização agora."), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
    },
    invalidateSize() { map.invalidateSize({ pan: false }); },
    destroy() { map.stop(); map.remove(); },
  };
}

export const MAP_CATEGORY_META = categoryMeta;

export function createPointPicker(container, { initial = null, center = null, onChange } = {}) {
  const map = L.map(container, { keyboard: true, scrollWheelZoom: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 19,
  }).addTo(map);
  const starting = initial || center;
  map.setView(starting ? [starting.latitude, starting.longitude] : [-15.8, -51.9], starting ? 12 : 4);
  let marker = null;
  let circle = null;
  const choose = ({ lat, lng }) => {
    const latitude = Number(lat.toFixed(2));
    const longitude = Number(lng.toFixed(2));
    const position = [latitude, longitude];
    if (marker) marker.setLatLng(position);
    else marker = L.marker(position, { draggable: true, title: "Região aproximada escolhida" })
      .addTo(map).on("dragend", () => choose(marker.getLatLng()));
    if (circle) circle.setLatLng(position);
    else circle = L.circle(position, { radius: 900, color: "#683bb4", fillOpacity: 0.12 }).addTo(map);
    onChange?.({ latitude, longitude, radius_m: 900 });
  };
  map.on("click", (event) => choose(event.latlng));
  if (initial) choose({ lat: initial.latitude, lng: initial.longitude });
  return {
    invalidateSize() { map.invalidateSize({ pan: false }); },
    chooseCenter() { choose(map.getCenter()); },
    destroy() { map.remove(); },
  };
}
