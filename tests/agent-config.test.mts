import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AgentConfigError,
  loadAgentsConfig,
  parseAgentsConfig,
} from "../src/server/agents/config.ts";

function expectConfigError(
  run: () => void,
  code: AgentConfigError["code"],
): AgentConfigError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof AgentConfigError);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.ok(error.fix.length > 0);
    return error;
  }

  assert.fail(`Diharapkan error ${code}, tetapi tidak ada error`);
}

function withWorkspace(run: (workspaceRoot: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-agents-"));

  try {
    run(path.join(directory, "workspace"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("membaca konfigurasi agen yang valid", () => {
  const config = parseAgentsConfig({
    agents: [
      {
        id: "stub",
        name: "Stub Agent",
        command: "node",
        args: ["agent.mjs", "--flag"],
      },
      {
        id: "kedua",
        name: "Agen Kedua",
        command: "/usr/local/bin/agent",
        args: [],
      },
    ],
  });

  assert.equal(config.agents.length, 2);
  assert.deepEqual(config.byId.get("stub"), {
    id: "stub",
    name: "Stub Agent",
    command: "node",
    args: ["agent.mjs", "--flag"],
  });
  assert.equal(config.byId.get("kedua")?.command, "/usr/local/bin/agent");
});

test("menerima daftar agen kosong", () => {
  const config = parseAgentsConfig({ agents: [] });

  assert.deepEqual(config.agents, []);
  assert.equal(config.byId.size, 0);
});

test("menolak bentuk konfigurasi yang salah", () => {
  const cases: Array<{ value: unknown; code: AgentConfigError["code"] }> = [
    { value: null, code: "invalid-shape" },
    { value: [], code: "invalid-shape" },
    { value: {}, code: "invalid-shape" },
    { value: { agents: "bukan-array" }, code: "invalid-shape" },
    { value: { agents: [null] }, code: "invalid-shape" },
    {
      value: { agents: [{ name: "Tanpa ID", command: "node", args: [] }] },
      code: "invalid-shape",
    },
    {
      value: { agents: [{ id: "x", command: "node", args: [] }] },
      code: "invalid-shape",
    },
    {
      value: { agents: [{ id: "x", name: "X", args: [] }] },
      code: "invalid-shape",
    },
    {
      value: { agents: [{ id: "x", name: "X", command: "node" }] },
      code: "invalid-shape",
    },
    {
      value: { agents: [{ id: "x", name: "X", command: "node", args: "x" }] },
      code: "invalid-shape",
    },
    {
      value: {
        agents: [{ id: "x", name: "X", command: "node", args: [1] }],
      },
      code: "invalid-shape",
    },
    {
      value: {
        agents: [{ id: "ID BESAR", name: "X", command: "node", args: [] }],
      },
      code: "invalid-shape",
    },
    {
      value: {
        agents: [
          { id: "sama", name: "A", command: "node", args: [] },
          { id: "sama", name: "B", command: "node", args: [] },
        ],
      },
      code: "duplicate-id",
    },
  ];

  for (const item of cases) {
    expectConfigError(() => parseAgentsConfig(item.value), item.code);
  }
});

test("membaca agents.json dari workspace dan menolak file bermasalah", () => {
  withWorkspace((workspaceRoot) => {
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "agents.json"),
      JSON.stringify({
        agents: [
          { id: "stub", name: "Stub", command: "node", args: [] },
        ],
      }),
    );

    const config = loadAgentsConfig({ workspaceRoot });
    assert.equal(config.byId.get("stub")?.name, "Stub");

    fs.writeFileSync(path.join(workspaceRoot, "agents.json"), "{rusak");
    expectConfigError(
      () => loadAgentsConfig({ workspaceRoot }),
      "invalid-json",
    );

    fs.rmSync(path.join(workspaceRoot, "agents.json"));
    expectConfigError(
      () => loadAgentsConfig({ workspaceRoot }),
      "missing-file",
    );
  });
});

test("menolak workspace relatif dan agents.json berupa symlink", () => {
  expectConfigError(
    () => loadAgentsConfig({ workspaceRoot: "workspace-relatif" }),
    "workspace",
  );

  withWorkspace((workspaceRoot) => {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "workflow-agents-outside-"),
    );

    try {
      fs.mkdirSync(workspaceRoot, { recursive: true });
      fs.writeFileSync(path.join(outside, "agents.json"), '{"agents":[]}');
      fs.symlinkSync(
        path.join(outside, "agents.json"),
        path.join(workspaceRoot, "agents.json"),
      );

      expectConfigError(
        () => loadAgentsConfig({ workspaceRoot }),
        "unsafe-path",
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
