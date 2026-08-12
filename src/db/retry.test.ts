import { describe, expect, it, vi } from "vitest";
import { mitColdStartRetry } from "./retry";

describe("mitColdStartRetry", () => {
  it("gibt das Ergebnis direkt zurück, wenn kein Fehler auftritt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(mitColdStartRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("versucht bei einem transienten Verbindungsfehler erneut und liefert dann das Ergebnis", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValueOnce("ok");
    await expect(mitColdStartRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("erkennt transiente Postgres-Fehlercodes (z.B. 57P03, cannot_connect_now)", async () => {
    const fehler = Object.assign(new Error("Fehler ohne passenden Text"), {
      code: "57P03",
    });
    const fn = vi.fn().mockRejectedValueOnce(fehler).mockResolvedValueOnce("ok");
    await expect(mitColdStartRetry(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gibt nach Erschöpfung der Versuche den letzten Fehler weiter", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Connection terminated"));
    await expect(mitColdStartRetry(fn, 2)).rejects.toThrow(
      "Connection terminated"
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("versucht bei einem nicht-transienten Fehler kein zweites Mal", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Ungültige Eingabe"));
    await expect(mitColdStartRetry(fn)).rejects.toThrow("Ungültige Eingabe");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
