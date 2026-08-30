import { buildChatSuggestions } from "./chatSuggestions";

test("uses shop party and low-stock product in prompts", () => {
  const suggestions = buildChatSuggestions({
    customers: [
      { name: "Azad", totalPending: 90000 },
      { name: "Ramesh", totalPending: 0 },
    ],
    products: [
      { name: "2130 Highlight", stockQty: 5, lowStockThreshold: 25 },
      { name: "Basin", stockQty: 40, lowStockThreshold: 5 },
    ],
    invoices: [
      {
        type: "sale",
        customerName: "Azad",
        date: "2026-08-28T10:00:00.000Z",
      },
    ],
  });
  expect(suggestions).toHaveLength(4);
  expect(suggestions.find((s) => s.hint === "Bill")?.q).toBe("Azad ka last bill");
  expect(suggestions.find((s) => s.hint === "Udhari")?.q).toBe("Azad ki udhari kitni hai?");
  expect(suggestions.find((s) => s.hint === "Stock")?.q).toBe("2130 Highlight ka stock kitna hai?");
  expect(suggestions.find((s) => s.hint === "Kamai")?.q).toBe("aaj ki kamai");
});

test("falls back when shop ledger is empty", () => {
  const suggestions = buildChatSuggestions({ customers: [], products: [], invoices: [] });
  expect(suggestions.map((s) => s.hint)).toEqual(["Bill", "Kamai", "Udhari", "Stock"]);
  expect(suggestions.find((s) => s.hint === "Bill")?.q).toBe("aaj ke bills dikhao");
});
