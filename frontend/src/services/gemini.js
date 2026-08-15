// Gemini NLU + Vision. Uses the Google Generative Language REST API when a key is present,
// otherwise falls back to the local heuristic parser so voice works in DEMO mode.
import { geminiConfig, GEMINI_READY } from "@/services/config";
import { localParse } from "@/services/localNlu";
import { TILE_SIZE_PROMPT_VALUES } from "@/lib/tileSizes";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_INSTRUCTION = `You are DukanSaathi, a voice assistant for an Indian tiles & sanitaryware shop.
The owner speaks Hindi, English, or a mix. Convert the command into a single JSON object ONLY (no markdown).
Schema:
{
  "intent": "sale|purchase|return|payment|stock_query|udhari_query|buyers_query|topseller_query|unknown",
  "language": "hi|en",
  "entities": {
    "product": "string or null",
    "qty": number or null,
    "customer": "string or null",
    "amount": number or null,
    "mode": "cash|online|pending or null"
  }
}
Never invent data. If unsure, use null. Return ONLY the JSON.`;

async function callGemini(contents, jsonOnly = true) {
  const url = `${BASE}/${geminiConfig.model}:generateContent?key=${geminiConfig.apiKey}`;
  const body = {
    contents,
    ...(jsonOnly ? { generationConfig: { responseMimeType: "application/json", temperature: 0.1 } } : {}),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Gemini API error " + res.status);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text;
}

export async function parseCommand(transcript) {
  if (!GEMINI_READY) return localParse(transcript);
  try {
    const text = await callGemini([
      { role: "user", parts: [{ text: SYSTEM_INSTRUCTION + "\n\nCommand: " + transcript }] },
    ]);
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("Gemini parse failed, using local NLU", e);
    return localParse(transcript);
  }
}

// Bulk stock intake: extract line items from a photo/PDF of a supplier's stock sheet.
export async function extractStockSheet(base64, mimeType) {
  if (!GEMINI_READY) {
    // Demo extraction sample with a flagged low-confidence row.
    return [
      { name: "2130 Highlight", code: "2130", company: "Kajaria", size: "2x2 ft", unit: "box", piecesPerBox: 4, qty: 50, price: 320, lowConfidence: false },
      { name: "Wall Tile Glossy White", code: "WTGW", company: "Nitco", size: "12x18 in", unit: "box", piecesPerBox: 6, qty: 30, price: 180, lowConfidence: false },
      { name: "Basin Pedestal (?)", code: "", company: "Cera", size: "", unit: "piece", piecesPerBox: 1, qty: 8, price: 650, lowConfidence: true },
    ];
  }
  const prompt = `Extract every product line from this tiles & sanitaryware supplier stock sheet as a JSON array.
Each object: { "name": string, "code": string, "company": string, "size": string, "unit": "box"|"piece", "piecesPerBox": number, "qty": number, "price": number, "lowConfidence": boolean }.
Tiles / flooring → unit="box". size MUST be one of: ${TILE_SIZE_PROMPT_VALUES}. Never write bare 2x2 or 12x18; 2x2/600x600 → "2x2 ft", 12x18/300x450 → "12x18 in". qty is boxes.
Sanitary / basins / closets / taps → unit="piece", size="", piecesPerBox=1, qty is pieces.
Set lowConfidence=true if the row is blurry/handwritten/uncertain. Return ONLY the JSON array.`;
  try {
    const text = await callGemini([
      { role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] },
    ]);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(cleaned);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn("Gemini vision failed", e);
    throw e;
  }
}
