import { createHash } from "node:crypto";

import { tokenize } from "./text.mjs";

const SYNONYMS = new Map([
  ["fix", ["repair", "edit", "debug", "change"]],
  ["repair", ["fix", "edit", "change"]],
  ["modify", ["edit", "change", "patch"]],
  ["change", ["edit", "modify", "patch"]],
  ["source", ["code", "file", "filesystem"]],
  ["project", ["local", "filesystem", "repo"]],
  ["test", ["run", "command", "shell", "verify"]],
  ["inspect", ["read", "analyze", "filesystem"]],
  ["research", ["search", "web", "source"]],
  ["lookup", ["search", "web", "research"]],
  ["picture", ["image", "photo"]],
  ["photo", ["image", "picture"]]
]);

function hashFeature(feature) {
  const hash = createHash("sha256").update(feature).digest();
  return {
    indexSeed: hash.readUInt32BE(0),
    sign: hash[4] % 2 === 0 ? 1 : -1
  };
}

function addFeature(vector, feature, weight) {
  const { indexSeed, sign } = hashFeature(feature);
  vector[indexSeed % vector.length] += sign * weight;
}

function featuresFor(text) {
  const tokens = tokenize(text);
  const features = [];

  for (const token of tokens) {
    features.push([`tok:${token}`, 1]);
    for (const synonym of SYNONYMS.get(token) ?? []) {
      features.push([`syn:${synonym}`, 0.7]);
    }
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 3; i++) {
        features.push([`tri:${token.slice(i, i + 3)}`, 0.2]);
      }
    }
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    features.push([`bi:${tokens[i]}_${tokens[i + 1]}`, 0.5]);
  }

  return features;
}

export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

export function embedText(text, { dimensions = 256 } = {}) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const [feature, weight] of featuresFor(text)) {
    addFeature(vector, feature, weight);
  }
  return normalizeVector(vector);
}

export function cosineSimilarity(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
