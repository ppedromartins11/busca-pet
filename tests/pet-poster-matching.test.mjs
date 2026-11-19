import { test } from "node:test";
import assert from "node:assert/strict";
import { compareAlerts, possibleMatches } from "../src/pet-matching.js";
import { posterText, drawPoster, POSTER_WIDTH, POSTER_HEIGHT } from "../src/pet-poster.js";

const lost = { id: "a", type: "lost", status: "active", visibility: "public",
  city: "Campo Grande", region: "Centro", pet_id: "p1", last_seen_at: "2026-11-18T12:00:00Z" };
const found = { id: "b", type: "found", status: "active", visibility: "public",
  city: "Campo Grande", region: "Centro", pet_id: "p2", last_seen_at: "2026-11-19T12:00:00Z" };
const pet1 = { id: "p1", species: "dog", size: "medium", breed: "SRD", coat_description: "caramelo claro" };
const pet2 = { id: "p2", species: "dog", size: "medium", breed: "SRD", coat_description: "caramelo escuro" };

test("comparação retorna razões explicáveis e inclui apenas alertas compatíveis", () => {
  const match = compareAlerts(lost, found, new Map([[pet1.id, pet1],[pet2.id, pet2]]));
  assert.ok(match);
  assert.ok(match.reasons.includes("Mesma cidade"));
  assert.ok(match.reasons.includes("Mesma espécie"));
  assert.ok(match.reasons.includes("Mesmo porte"));
  assert.ok(match.score >= 10);
  const ranking = possibleMatches(lost, [found, { ...found, id:"z", visibility:"private" }], [pet1, pet2]);
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].occurrence.id, found.id);
  assert.equal(compareAlerts(lost, { ...found, city: "Dourados" }, new Map()), null);
  assert.equal(compareAlerts(lost, { ...found, status: "reunited" }, new Map()), null);
  assert.equal(compareAlerts(lost, { ...found, type: "lost" }, new Map()), null);
  assert.equal(compareAlerts(lost, { ...found, pet_id: "cat" }, new Map([
    [pet1.id, pet1], ["cat", { species: "cat" }],
  ])), null);
});

test("cartaz inclui apenas o telefone explicitamente autorizado", () => {
  const row = { type: "lost", pet_name: "Hex", region: "Centro", city: "Campo Grande",
    description: "Cão de porte médio", contact_whatsapp: "5567999991234" };
  assert.equal(posterText(row).phone, "");
  assert.match(posterText(row, true).phone, /\+55/);
  assert.equal(posterText({ ...row, contact_whatsapp: null }, true).phone, "");
  assert.equal(posterText({ ...row, contact_whatsapp: "javascript:evil" }, true).phone, "");
  assert.equal(posterText({ ...row, type: "found" }).title, "ANIMAL ENCONTRADO");
});

test("cartaz é desenhado em alta resolução sem dependências externas", () => {
  const operations = [];
  const ctx = {
    fillStyle: "", font: "", textAlign: "left",
    fillRect(...args) { operations.push(["rect", ...args]); },
    fillText(...args) { operations.push(["text", ...args]); },
    measureText(str) { return { width: String(str).length * 20 }; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    drawImage() { operations.push(["image"]); },
  };
  const canvas = { width: 0, height: 0, getContext() { return ctx; } };
  const row = { type: "lost", pet_name: "Hex", city: "Campo Grande", region: "Centro",
    description: "Pelagem caramelo, visto perto do parque", public_reference: "Próximo à praça" };
  assert.equal(drawPoster(canvas, row), canvas);
  assert.equal(canvas.width, POSTER_WIDTH);
  assert.equal(canvas.height, POSTER_HEIGHT);
  assert.ok(operations.some((operation) => operation[0] === "text" && operation[1] === "PROCURA-SE"));
  assert.ok(operations.some((operation) => operation[0] === "text" && operation[1] === "Hex"));
});
