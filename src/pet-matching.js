// Comparação explicável de alertas, sem reconhecimento de imagem ou IA.
// Dados analisados são apenas os campos públicos dos alertas e animais associados.
const normalized = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const tokens = (text) => new Set(normalized(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 4
  && !["pelo", "pela", "para", "animal", "medio", "curta", "longo", "longo"].includes(word)));

export function compareAlerts(reference, candidate, pets = new Map()) {
  if (!reference || !candidate || reference.id === candidate.id || reference.type === candidate.type
    || !["lost", "found"].includes(reference.type) || !["lost", "found"].includes(candidate.type)
    || reference.visibility !== "public" || candidate.visibility !== "public"
    || reference.status !== "active" || candidate.status !== "active") return null;

  const reasons = [];
  let score = 0;
  const city1 = normalized(reference.city), city2 = normalized(candidate.city);
  if (city1 && city2 && city1 !== city2) return null; // versões locais: prioridade à mesma cidade
  if (city1 && city1 === city2) { score += 4; reasons.push("Mesma cidade"); }
  if (normalized(reference.region) && normalized(reference.region) === normalized(candidate.region)) {
    score += 2; reasons.push("Mesmo bairro ou região");
  }
  const a = pets.get(reference.pet_id) || {};
  const b = pets.get(candidate.pet_id) || {};
  if (a.species && b.species && a.species !== "other" && a.species === b.species) {
    score += 3; reasons.push("Mesma espécie");
  } else if (a.species && b.species && a.species !== b.species && b.species !== "other") {
    return null; // incompatibilidade conhecida
  }
  if (a.size && b.size && a.size !== "unknown" && a.size === b.size) {
    score += 2; reasons.push("Mesmo porte");
  }
  if (a.breed && b.breed && normalized(a.breed) === normalized(b.breed)) {
    score += 1; reasons.push("Raça informada semelhante");
  }
  const common = [...tokens(a.coat_description)].filter((word) => tokens(b.coat_description).has(word));
  if (common.length) { score += 1; reasons.push("Descrição da pelagem semelhante"); }
  const one = Date.parse(reference.last_seen_at || ""), two = Date.parse(candidate.last_seen_at || "");
  if (Number.isFinite(one) && Number.isFinite(two) && Math.abs(one - two) <= 30 * 86400000) {
    score += 1; reasons.push("Datas próximas");
  }
  return reasons.length && score >= 4 ? { occurrence: candidate, score, reasons } : null;
}

export function possibleMatches(reference, occurrences, pets, limit = 6) {
  const petIndex = new Map(pets.map((pet) => [pet.id, pet]));
  return occurrences.map((candidate) => compareAlerts(reference, candidate, petIndex))
    .filter(Boolean).sort((a, b) => b.score - a.score
      || String(b.occurrence.last_seen_at).localeCompare(String(a.occurrence.last_seen_at)))
    .slice(0, limit);
}
