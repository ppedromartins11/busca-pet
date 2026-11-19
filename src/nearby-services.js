// Diretorio de estabelecimentos com contatos publicados em fontes abertas.
// Nao representa convenio ou vinculo comercial com o BuscaPet.
export const localServices = Object.freeze([
  {
    name: "Vets Centro Veterinário 24h",
    type: "Clínica veterinária",
    address: "Rua Maranhão, 187, Vila Rica, Campo Grande - MS, Brasil",
    phone: "(67) 3305-5803",
    website: "https://www.vets24h.com.br/",
    source: "https://www.vets24h.com.br/",
  },
  {
    name: "VetMania",
    type: "Clínica e pet shop",
    address: "Rua Tapajós, 535, Vila Rica, Campo Grande - MS, Brasil",
    phone: "(67) 99230-3301",
    website: "https://vetmania.vet.br/",
    source: "https://vetmania.vet.br/",
  },
  {
    name: "Petz Campo Grande",
    type: "Pet shop",
    address: "Av. Afonso Pena, 5420, Chácara Cachoeira, Campo Grande - MS, Brasil",
    phone: "(67) 3222-6097",
    website: "https://www.petz.com.br/loja/petz-campo-grande",
    source: "https://www.petz.com.br/loja/petz-campo-grande",
  },
  {
    name: "Pet Here",
    type: "Pet shop",
    address: "Rua Antônio Maria Coelho, 2640, Centro, Campo Grande - MS, Brasil",
    phone: "(67) 99233-4188",
    website: "http://www.pethere.com.br/",
    source: "https://www.santoguia.com.br/empresa/campo-grande-ms/pet-here-pet-shop",
  },
]);

export const mapUrl = (value) =>
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(value);

export const nearbyMapUrl = (latitude, longitude) =>
  mapUrl("clínica veterinária pet shop perto de " + latitude + "," + longitude);

export function distanceKm(a, b, c, d) {
  const toRad = (value) => value * Math.PI / 180;
  const x = Math.sin(toRad((c - a) / 2)) ** 2
    + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(toRad((d - b) / 2)) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function normalizeOSM(element, center) {
  const tags = element.tags || {};
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const name = String(tags.name || "").trim();
  if (!name || name.length > 120) return null;
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const neighborhood = tags["addr:suburb"] || tags["addr:neighbourhood"] || "";
  const city = tags["addr:city"] || "";
  const address = [street, neighborhood, city].filter(Boolean).join(" - ");
  const phone = String(tags["contact:phone"] || tags.phone || "").split(";")[0].trim();
  const website = String(tags["contact:website"] || tags.website || "");
  return {
    name, type: tags.amenity === "veterinary" ? "Clínica veterinária" : "Pet shop",
    address: address || "Consulte o endereço no mapa",
    phone: phone.length <= 30 ? phone : "",
    website: /^https?:\/\//i.test(website) ? website : "",
    mapLink: mapUrl(latitude + "," + longitude),
    distance: distanceKm(center.latitude, center.longitude, latitude, longitude),
  };
}

export async function findNearbyServices(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
    throw Error("Localização inválida.");
  // A consulta só ocorre após a pessoa solicitar a busca por proximidade.
  const query = `[out:json][timeout:15];(
    nwr(around:12000,${latitude.toFixed(5)},${longitude.toFixed(5)})["amenity"="veterinary"];
    nwr(around:12000,${latitude.toFixed(5)},${longitude.toFixed(5)})["shop"="pet"];
  );out center;`;
  const response = await fetch(
    "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query),
    { signal: AbortSignal.timeout(23000) },
  );
  if (!response.ok) throw Error("Não foi possível consultar os serviços próximos.");
  const result = await response.json();
  if (!Array.isArray(result.elements)) throw Error("Resposta de localização inválida.");
  const unique = new Set();
  return result.elements.map((element) => normalizeOSM(element, { latitude, longitude }))
    .filter((service) => {
      if (!service) return false;
      const key = service.name.toLocaleLowerCase("pt-BR") + service.mapLink;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 16);
}
