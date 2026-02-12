import { describe, it, expect } from "vitest";
import {
  toModelOptions,
  getModelsForBackend,
  getModesForBackend,
  getDefaultModel,
  getDefaultMode,
  getSandboxMode,
  getPermissionMode,
  CLAUDE_MODELS,
  CODEX_MODELS,
  CLAUDE_MODES,
  CODEX_MODES,
} from "./backends.js";

describe("toModelOptions", () => {
  it("converts server model info to frontend ModelOption with icons", () => {
    const models = [
      { value: "gpt-5.2-codex", label: "gpt-5.2-codex", description: "Frontier" },
      { value: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini", description: "Fast" },
    ];

    const options = toModelOptions(models);

    expect(options).toHaveLength(2);
    expect(options[0].value).toBe("gpt-5.2-codex");
    expect(options[0].label).toBe("gpt-5.2-codex");
    expect(options[0].icon).toBeTruthy();
    expect(options[1].value).toBe("gpt-5.1-codex-mini");
  });

  it("assigns codex icon to codex-containing slugs", () => {
    const options = toModelOptions([
      { value: "gpt-5.2-codex", label: "GPT-5.2 Codex", description: "" },
    ]);
    expect(options[0].icon).toBe("\u2733"); // ✳
  });

  it("assigns max icon to max-containing slugs", () => {
    const options = toModelOptions([
      { value: "gpt-5.1-codex-max", label: "GPT-5.1 Max", description: "" },
    ]);
    // "codex" appears before "max" in the slug, so codex icon wins
    expect(options[0].icon).toBe("\u2733");
  });

  it("assigns mini icon to mini-only slugs", () => {
    const options = toModelOptions([
      { value: "gpt-5.1-mini", label: "GPT-5.1 Mini", description: "" },
    ]);
    expect(options[0].icon).toBe("\u26A1"); // ⚡
  });

  it("uses fallback icon for generic model slugs", () => {
    const options = toModelOptions([
      { value: "gpt-5.2", label: "GPT-5.2", description: "" },
    ]);
    // Should use one of the fallback icons
    expect(options[0].icon).toBeTruthy();
    expect(options[0].icon.length).toBeGreaterThan(0);
  });

  it("uses value as label when label is empty", () => {
    const options = toModelOptions([
      { value: "some-model", label: "", description: "" },
    ]);
    expect(options[0].label).toBe("some-model");
  });

  it("handles empty array", () => {
    expect(toModelOptions([])).toEqual([]);
  });
});

describe("getModelsForBackend", () => {
  it("returns claude models for claude backend", () => {
    expect(getModelsForBackend("claude")).toBe(CLAUDE_MODELS);
  });

  it("returns codex models for codex backend", () => {
    expect(getModelsForBackend("codex")).toBe(CODEX_MODELS);
  });
});

describe("getModesForBackend", () => {
  it("returns claude modes for claude backend", () => {
    expect(getModesForBackend("claude")).toBe(CLAUDE_MODES);
  });

  it("returns codex modes for codex backend", () => {
    expect(getModesForBackend("codex")).toBe(CODEX_MODES);
  });
});

describe("getDefaultModel", () => {
  it("returns first claude model for claude backend", () => {
    expect(getDefaultModel("claude")).toBe(CLAUDE_MODELS[0].value);
  });

  it("returns first codex model for codex backend", () => {
    expect(getDefaultModel("codex")).toBe(CODEX_MODELS[0].value);
  });
});

describe("getDefaultMode", () => {
  it("returns first claude mode for claude backend", () => {
    expect(getDefaultMode("claude")).toBe(CLAUDE_MODES[0].value);
  });

  it("returns first codex mode for codex backend", () => {
    expect(getDefaultMode("codex")).toBe(CODEX_MODES[0].value);
  });
});

describe("static model/mode lists", () => {
  it("has codex models with GPT-5.x slugs", () => {
    for (const m of CODEX_MODELS) {
      expect(m.value).toMatch(/^gpt-5/);
    }
  });

  it("has claude models with claude- prefix", () => {
    for (const m of CLAUDE_MODELS) {
      expect(m.value).toMatch(/^claude-/);
    }
  });

  it("has at least 2 modes for each backend", () => {
    expect(CLAUDE_MODES.length).toBeGreaterThanOrEqual(2);
    expect(CODEX_MODES.length).toBeGreaterThanOrEqual(2);
  });

  it("claude modes include sandbox-auto as first option", () => {
    expect(CLAUDE_MODES[0].value).toBe("sandbox-auto");
    expect(CLAUDE_MODES[0].label).toBe("Sandbox");
  });

  it("claude modes include sandbox-ask option", () => {
    const ask = CLAUDE_MODES.find((m) => m.value === "sandbox-ask");
    expect(ask).toBeDefined();
    expect(ask!.label).toBe("Sandbox (Ask)");
  });

  it("claude modes include yolo mode", () => {
    const yolo = CLAUDE_MODES.find((m) => m.value === "yolo");
    expect(yolo).toBeDefined();
    expect(yolo!.label).toBe("YOLO");
  });

  it("claude default mode is sandbox-auto", () => {
    expect(getDefaultMode("claude")).toBe("sandbox-auto");
  });
});

describe("getSandboxMode", () => {
  it("returns auto-allow for sandbox-auto", () => {
    expect(getSandboxMode("sandbox-auto")).toBe("auto-allow");
  });

  it("returns ask-first for sandbox-ask", () => {
    expect(getSandboxMode("sandbox-ask")).toBe("ask-first");
  });

  it("returns off for other modes", () => {
    expect(getSandboxMode("bypassPermissions")).toBe("off");
    expect(getSandboxMode("plan")).toBe("off");
    expect(getSandboxMode("yolo")).toBe("off");
  });
});

describe("getPermissionMode", () => {
  it("returns bypassPermissions for sandbox-auto", () => {
    expect(getPermissionMode("sandbox-auto")).toBe("bypassPermissions");
  });

  it("returns default for sandbox-ask", () => {
    expect(getPermissionMode("sandbox-ask")).toBe("default");
  });

  it("returns bypassPermissions for yolo", () => {
    expect(getPermissionMode("yolo")).toBe("bypassPermissions");
  });

  it("returns plan for plan mode", () => {
    expect(getPermissionMode("plan")).toBe("plan");
  });

  it("returns bypassPermissions for agent mode", () => {
    expect(getPermissionMode("bypassPermissions")).toBe("bypassPermissions");
  });
});
