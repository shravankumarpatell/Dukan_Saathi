// Local heuristic NLU used in DEMO mode (no Gemini key). Handles bilingual Hindi/English
// (usually typed in Latin script by Web Speech) commands for the core action set.
// Returns { intent, entities, language, reply } — a DRAFT plan, never a direct write.

const HINDI_HINT = /[\u0900-\u097F]|kitna|kitni|bacha|baaki|udhari|kaun|le gya|le gaya|bika|bill|banao|becha|kharida|wapas|return|haan|nahi/i;

function detectLang(text) {
  return HINDI_HINT.test(text) ? "hi" : "en";
}

function extractQty(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(box|boxes|pcs|piece|pieces|peti|dabba)?/i);
  return m ? parseFloat(m[1]) : null;
}

function extractAmount(text) {
  const m = text.match(/(?:rs|rupees|rupaye|₹)\s*(\d+(?:\.\d+)?)|(\d{3,})\s*(?:rupees|rupaye|rs)?/i);
  if (m) return parseFloat(m[1] || m[2]);
  return null;
}

export function localParse(transcript) {
  const text = (transcript || "").trim();
  const lower = text.toLowerCase();
  const language = detectLang(text);

  // Queries first
  if (/(kitna|kitni).*(stock|bacha|maal)|stock.*(kitna|left|bacha)|how much stock/i.test(lower)) {
    return { intent: "stock_query", language, entities: { product: cleanProduct(text) } };
  }
  if (/(udhari|udhar|baaki|pending|balance|due).*(kitna|kitni|baaki|hai)|kitna.*(udhari|baaki|pending)/i.test(lower)) {
    return { intent: "udhari_query", language, entities: { customer: cleanCustomer(text) } };
  }
  if (/(kaun|kon|who).*(le gya|le gaya|liya|bought|kharida)/i.test(lower)) {
    return { intent: "buyers_query", language, entities: { product: cleanProduct(text) } };
  }
  if (/(sabse zyada|top|best).*(bika|sell|selling|seller)|top seller|kya bika/i.test(lower)) {
    return { intent: "topseller_query", language, entities: {} };
  }

  // Return
  if (/(return|wapas|vapas|laut)/i.test(lower)) {
    return {
      intent: "return", language,
      entities: { product: cleanProduct(text), qty: extractQty(text), customer: cleanCustomer(text) },
    };
  }

  // Payment (clearing udhari, no items)
  if (/(payment|paisa|paise|jama|diya|de gya|de gaya|clear|chukaya).*(rs|rupees|rupaye|₹|\d{3,})/i.test(lower) &&
      !/(box|piece|tile|bill|becha|sold)/i.test(lower)) {
    return {
      intent: "payment", language,
      entities: { customer: cleanCustomer(text), amount: extractAmount(text), mode: /online|upi|gpay|phonepe|paytm/i.test(lower) ? "online" : "cash" },
    };
  }

  // Stock-in phrases → steer to Add Stock (no purchase invoice intent).
  if (/(kharida|khareeda|purchase|stock.?in|aaya|mangaya|order aya)/i.test(lower)) {
    return {
      intent: "unknown", language,
      entities: { product: cleanProduct(text), qty: extractQty(text) },
    };
  }

  // Sale (default for anything with a qty + product-ish words, or "becha/bill")
  if (/(becha|bech|sold|sell|bill|banao|de do|diya)/i.test(lower) || (extractQty(text) && cleanProduct(text))) {
    return {
      intent: "sale", language,
      entities: {
        product: cleanProduct(text),
        qty: extractQty(text),
        customer: cleanCustomer(text),
        mode: /online|upi|gpay|phonepe|paytm/i.test(lower) ? "online" : (/udhari|udhar|pending|baaki/i.test(lower) ? "pending" : "cash"),
      },
    };
  }

  return { intent: "unknown", language, entities: {}, raw: text };
}

function cleanProduct(text) {
  // grab a product-like token: a code (digits) or capitalised words / known keywords
  const code = text.match(/\b(\d{3,4}[a-z]?)\b/i);
  const named = text.match(/(highlight[\w\s]*?(blue|yellow|white)?|wash basin|closet|marble[\w\s]*tile|floor tile|wall tile|basin|tile)/i);
  const parts = [];
  if (code) parts.push(code[1]);
  if (named) parts.push(named[0]);
  return parts.join(" ").trim() || null;
}

function cleanCustomer(text) {
  const m = text.match(/(?:ko|for|customer|party|naam|name|se)\s+([a-z]+(?:\s[a-z]+)?)/i);
  if (m) return m[1].trim();
  const known = text.match(/\b(ashok|ramesh|suresh|mahesh|rajesh|dinesh)\b/i);
  return known ? known[1] : null;
}
