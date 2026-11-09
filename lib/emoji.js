// Picks an emoji from a subject or note name. Works with no internet and no AI.
// The first group that matches wins, so the more specific groups come first.
const GROUPS = [
  ["💼", ["business", "management", "entrepreneur", "startup", "corporate", "commerce", "enterprise"]],
  ["📈", ["marketing", "sales", "brand", "advertis", "growth"]],
  ["💰", ["finance", "financial", "banking", "invest", "money", "tax", "budget", "wealth", "stock"]],
  ["🧾", ["accounting", "accounts", "audit", "bookkeeping", "costing"]],
  ["📊", ["economics", "economy", "statistics", "stats", "analytics", "data analysis", "excel"]],
  ["🧮", ["maths", "math", "algebra", "calculus", "arithmetic", "trigonometry", "geometry"]],
  ["⚛️", ["physics", "quantum", "mechanics", "thermodynamics", "optics"]],
  ["🧪", ["chemistry", "chemical", "organic", "inorganic", "lab"]],
  ["🧬", ["biology", "genetics", "zoology", "botany", "life science", "microbio"]],
  ["🩺", ["medicine", "medical", "anatomy", "physiology", "nursing", "pharma", "clinical", "health"]],
  ["🌍", ["geography", "earth", "environment", "climate", "ecology", "geology"]],
  ["🏛️", ["history", "ancient", "civilization", "civics", "heritage"]],
  ["⚖️", ["law", "legal", "constitution", "justice", "contract", "court"]],
  ["🗳️", ["politics", "political", "government", "policy", "public admin"]],
  ["🧠", ["psychology", "mind", "cognitive", "behaviour", "behavior", "neuro"]],
  ["🤝", ["sociology", "society", "social", "hr", "human resource", "leadership"]],
  ["🤔", ["philosophy", "ethics", "logic", "critical thinking"]],
  ["🤖", ["artificial intelligence", "machine learning", "robot", "ai ", " ai", "deep learning"]],
  ["💻", ["computer", "programming", "coding", "software", "javascript", "python", "java", "web", "it ", "database", "sql", "algorithm", "cyber", "network"]],
  ["⚙️", ["engineering", "mechanical", "civil", "electrical", "electronics", "circuit", "robotics"]],
  ["📐", ["design", "drawing", "architecture", "ux", "ui "]],
  ["🎨", ["art", "painting", "drawing", "creative", "sketch"]],
  ["🎵", ["music", "song", "piano", "guitar", "singing"]],
  ["🎬", ["film", "cinema", "movie", "media", "video", "photography"]],
  ["📖", ["literature", "poetry", "novel", "reading", "english", "grammar", "writing", "essay"]],
  ["🗣️", ["hindi", "french", "spanish", "german", "language", "speaking", "communication", "marathi", "sanskrit"]],
  ["🔭", ["astronomy", "space", "cosmos", "astro"]],
  ["🌱", ["agriculture", "farming", "garden", "nature", "plants"]],
  ["⚽", ["sports", "sport", "fitness", "football", "cricket", "yoga", "gym", "exercise"]],
  ["🍽️", ["food", "cooking", "nutrition", "culinary", "diet", "recipe"]],
  ["✈️", ["travel", "tourism", "aviation", "hospitality"]],
  ["🚗", ["automobile", "automotive", "transport", "logistics", "supply chain"]],
  ["🏗️", ["construction", "real estate", "property", "surveying"]],
  ["🎓", ["exam", "test", "mock", "revision", "syllabus", "study", "course", "lecture", "assignment", "project", "thesis"]],
  ["💡", ["ideas", "innovation", "tips", "tricks", "notes", "summary", "formula"]],
];

// Used when no word matches. Chosen by the name so it stays the same every time.
const FALLBACK = ["📘", "📗", "📙", "📕", "📓", "🗂️", "✨", "🎯", "🔖", "📚"];

function hash(str) {
  // FNV-1a, spreads similar names well
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

// Returns an emoji for the name, or null if nothing matches (when fallback is false)
export function autoEmoji(name, fallback = true) {
  const text = ` ${(name || "").toLowerCase()} `;
  for (const [emoji, words] of GROUPS) {
    for (const w of words) {
      const word = w.trim();
      // short words must match a whole word ("ai" must not match "chair")
      const needle = word.length <= 3 ? ` ${word} ` : word;
      if (text.includes(needle)) {
        return emoji;
      }
    }
  }
  return fallback ? FALLBACK[hash(text.trim()) % FALLBACK.length] : null;
}

// The emoji the admin chose wins; otherwise it is picked from the name.
export function subjectEmoji(subject) {
  const chosen = (subject?.emoji || "").trim();
  return chosen || autoEmoji(subject?.name, true);
}

// Folder colours (.f0 to .f13 in globals.css), ordered so that neighbouring
// folders always look different: blue, orange, pink, green, indigo, yellow ...
export const COLOR_ORDER = [0, 3, 8, 1, 10, 2, 9, 4, 5, 11, 12, 6, 13, 7];
