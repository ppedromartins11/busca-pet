import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localServices, mapUrl, normalizeOSM, distanceKm, findNearbyServices,
} from "../src/nearby-services.js";

test("diretorio publica contatos e enderecos de estabelecimentos identificaveis", () => {
  assert.equal(localServices.length, 4);
  for (const service of localServices) {
    assert.match(service.name, /\S+/);
    assert.match(service.address, /Campo Grande - MS, Brasil/);
    assert.match(service.phone, /\(67\)/);
    assert.match(service.website, /^https?:\/\//);
    assert.match(service.source, /^https:\/\//);
    assert.doesNotMatch(service.name, /exemplo|ilustrativo|fict/i);
    assert.ok(mapUrl(service.address).startsWith("https://www.google.com/maps/search/"));
  }
});

test("calcula distancia de forma consistente e nao cria coordenadas falsas", () => {
  assert.equal(distanceKm(-20.45, -54.6, -20.45, -54.6), 0);
  assert.ok(distanceKm(-20.45, -54.6, -20.47, -54.62) > 2);
  assert.equal(normalizeOSM({ tags: { name: "Sem coordenadas" } }, { latitude: -20, longitude: -54 }), null);
});

test("normaliza registros publicos de clinicas e lojas sem inventar telefone", () => {
  const origin = { latitude: -20.45, longitude: -54.6 };
  const service = normalizeOSM({
    lat: -20.451, lon: -54.602,
    tags: {
      name: "Servico existente no OpenStreetMap", amenity: "veterinary",
      "addr:street": "Rua Teste", "addr:housenumber": "123",
      "addr:city": "Campo Grande", "contact:phone": "+55 67 99999-9999",
      website: "javascript:alert(1)",
    },
  }, origin);
  assert.equal(service.type, "Clínica veterinária");
  assert.equal(service.phone, "+55 67 99999-9999");
  assert.equal(service.website, "");
  assert.ok(service.distance > 0);
  const missing = normalizeOSM({ lat: -20.452, lon: -54.601, tags: { name: "Loja", shop: "pet" } }, origin);
  assert.equal(missing.phone, "");
  assert.equal(missing.address, "Consulte o endereço no mapa");
});

test("consulta geolocalizada ordena os retornos pelo mais proximo", async () => {
  const oldFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          elements: [
            { lat: -20.50, lon: -54.6, tags: { name: "Mais longe", shop: "pet" } },
            { lat: -20.4501, lon: -54.6, tags: { name: "Mais perto", amenity: "veterinary" } },
          ],
        };
      },
    };
  };
  try {
    const services = await findNearbyServices(-20.45, -54.6);
    assert.equal(services[0].name, "Mais perto");
    assert.equal(services[1].name, "Mais longe");
    assert.match(decodeURIComponent(requestedUrl), /around:12000,-20\.45000,-54\.60000/);
    await assert.rejects(findNearbyServices(200, -54.6), /Localização inválida/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
