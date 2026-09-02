import {
  ApiError,
  friendlyMessage,
  parseErrorBody,
  errorMessage,
  OFFLINE_MESSAGE,
  SERVER_DOWN_MESSAGE,
  TIMEOUT_MESSAGE,
} from "./apiError";

function fakeResponse(body, { json = true } = {}) {
  const text = json ? JSON.stringify(body) : body;
  return { text: async () => text, headers: { get: () => null } };
}

describe("friendlyMessage", () => {
  it("shows business 4xx messages from the server verbatim", () => {
    expect(friendlyMessage(422, "Stock kam hai: Ivory (available 2, maanga 5)")).toMatch(/Stock kam hai/);
  });
  it("hides technical text", () => {
    expect(friendlyMessage(500, "sqlalchemy.exc.OperationalError: ...")).not.toMatch(/sqlalchemy/);
    expect(friendlyMessage(400, "TypeError: NoneType")).not.toMatch(/TypeError/);
  });
  it("maps infra statuses to retry copy", () => {
    expect(friendlyMessage(503)).toBe(SERVER_DOWN_MESSAGE);
    expect(friendlyMessage(504)).toBe(TIMEOUT_MESSAGE);
    expect(friendlyMessage(401)).toMatch(/login/i);
  });
  it("prefers the backend's Hinglish 5xx message when present", () => {
    expect(friendlyMessage(503, "Server abhi busy hai. Thodi der baad dobara try karein.")).toMatch(/busy/);
  });
});

describe("parseErrorBody", () => {
  it("reads the backend envelope", async () => {
    const out = await parseErrorBody(fakeResponse({ error: "Yeh record nahi mila.", type: "NotFoundError", requestId: "abc" }));
    expect(out).toEqual({ message: "Yeh record nahi mila.", type: "NotFoundError", requestId: "abc" });
  });
  it("reads FastAPI detail dicts and lists", async () => {
    expect((await parseErrorBody(fakeResponse({ detail: { error: "x" } }))).message).toBe("x");
    expect((await parseErrorBody(fakeResponse({ detail: [{ msg: "a" }, { msg: "b" }] }))).message).toBe("a; b");
  });
  it("ignores HTML proxy pages", async () => {
    const out = await parseErrorBody(fakeResponse("<html><body>502 Bad Gateway</body></html>", { json: false }));
    expect(out.message).toBeNull();
  });
});

describe("ApiError.fromFetchFailure", () => {
  it("marks timeouts", () => {
    const err = ApiError.fromFetchFailure(new DOMException("timeout", "TimeoutError"));
    expect(err.isTimeout).toBe(true);
    expect(err.isNetwork).toBe(true);
    expect(err.isRetryable).toBe(true);
    expect(err.message).toBe(TIMEOUT_MESSAGE);
  });
  it("distinguishes offline from server down", () => {
    const onLine = jest.spyOn(navigator, "onLine", "get");
    onLine.mockReturnValue(false);
    expect(ApiError.fromFetchFailure(new TypeError("Failed to fetch")).message).toBe(OFFLINE_MESSAGE);
    onLine.mockReturnValue(true);
    expect(ApiError.fromFetchFailure(new TypeError("Failed to fetch")).message).toBe(SERVER_DOWN_MESSAGE);
    onLine.mockRestore();
  });
});

describe("errorMessage", () => {
  it("never shows raw JS errors to the user", () => {
    expect(errorMessage(new TypeError("Cannot read properties of undefined"))).toBe("Kuch gadbad ho gayi. Dobara try karein.");
  });
  it("passes through ApiError and plain strings", () => {
    expect(errorMessage(new ApiError({ status: 409, message: "Yeh pehle se hai." }))).toBe("Yeh pehle se hai.");
    expect(errorMessage("Custom")).toBe("Custom");
  });
});
