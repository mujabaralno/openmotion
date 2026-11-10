import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AGENTS_FILE_NAME,
  DEFAULT_AGENTS_JSON,
  initializeWorkspace,
  WorkspaceInitializationError,
  WORKSPACE_DIRECTORIES,
} from "../src/server/workspace/init.ts";

function withTempParent(run: (parent: string) => void) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-init-"));

  try {
    run(parent);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function expectError(
  run: () => void,
  code: WorkspaceInitializationError["code"],
): WorkspaceInitializationError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof WorkspaceInitializationError);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.ok(error.fix.length > 0);
    return error;
  }

  assert.fail(`Diharapkan error ${code}, tetapi tidak ada error`);
}

function agentsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, AGENTS_FILE_NAME);
}

test("inisialisasi pertama membuat struktur workspace dan agents.json", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    const result = initializeWorkspace({ workspaceDir: workspaceRoot });

    assert.equal(result.workspaceRoot, workspaceRoot);
    assert.deepEqual(result.createdDirectories, [
      "episodes",
      "prompts",
      "guide",
    ]);
    assert.equal(result.createdAgentsFile, true);

    for (const name of WORKSPACE_DIRECTORIES) {
      assert.equal(
        fs.statSync(path.join(workspaceRoot, name)).isDirectory(),
        true,
      );
    }

    assert.equal(fs.statSync(agentsPath(workspaceRoot)).isFile(), true);
    assert.equal(fs.statSync(agentsPath(workspaceRoot)).mode & 0o777, 0o644);

    const agents = JSON.parse(
      fs.readFileSync(agentsPath(workspaceRoot), "utf8"),
    );

    assert.deepEqual(agents, JSON.parse(DEFAULT_AGENTS_JSON));
    assert.equal(Array.isArray(agents.agents), true);
    assert.deepEqual(agents.agents[0], {
      id: "command-code",
      name: "Command Code",
      command: "cmd",
      args: ["acp"],
    });

    assert.deepEqual(fs.readdirSync(parent), ["workspace"]);
  });
});

test("membuat folder workspace beserta folder induk yang belum ada", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(
      parent,
      "nested",
      "lebih-dalam",
      "workspace",
    );

    const result = initializeWorkspace({ workspaceDir: workspaceRoot });

    assert.equal(result.workspaceRoot, workspaceRoot);
    assert.equal(fs.statSync(workspaceRoot).isDirectory(), true);
  });
});

test("inisialisasi ulang tidak menimpa file atau episode pengguna", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    initializeWorkspace({ workspaceDir: workspaceRoot });

    const customAgents = '{"agents":[]}\n';
    fs.writeFileSync(agentsPath(workspaceRoot), customAgents);

    const prompt = path.join(workspaceRoot, "prompts", "script.md");
    const guide = path.join(workspaceRoot, "guide", "style-parallax.md");
    const episodeFile = path.join(
      workspaceRoot,
      "episodes",
      "episode-a",
      "01-naskah.md",
    );

    fs.writeFileSync(prompt, "prompt pengguna");
    fs.writeFileSync(guide, "panduan pengguna");
    fs.mkdirSync(path.dirname(episodeFile), { recursive: true });
    fs.writeFileSync(episodeFile, "naskah pengguna");

    const result = initializeWorkspace({ workspaceDir: workspaceRoot });

    assert.deepEqual(result.createdDirectories, []);
    assert.equal(result.createdAgentsFile, false);
    assert.equal(fs.readFileSync(agentsPath(workspaceRoot), "utf8"), customAgents);
    assert.equal(fs.readFileSync(prompt, "utf8"), "prompt pengguna");
    assert.equal(fs.readFileSync(guide, "utf8"), "panduan pengguna");
    assert.equal(fs.readFileSync(episodeFile, "utf8"), "naskah pengguna");
  });
});

test("melengkapi workspace yang baru terisi sebagian", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    fs.mkdirSync(path.join(workspaceRoot, "prompts"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceRoot, "prompts", "script.md"),
      "prompt yang sudah ada",
    );

    const result = initializeWorkspace({ workspaceDir: workspaceRoot });

    assert.deepEqual(result.createdDirectories, ["episodes", "guide"]);
    assert.equal(result.createdAgentsFile, true);
    assert.equal(
      fs.readFileSync(
        path.join(workspaceRoot, "prompts", "script.md"),
        "utf8",
      ),
      "prompt yang sudah ada",
    );
    assert.equal(
      fs.statSync(path.join(workspaceRoot, "episodes")).isDirectory(),
      true,
    );
    assert.equal(
      fs.statSync(path.join(workspaceRoot, "guide")).isDirectory(),
      true,
    );
  });
});

test("menolak WORKSPACE_DIR yang kosong atau bukan path absolut", () => {
  const missing = expectError(
    () => initializeWorkspace({ workspaceDir: "" }),
    "missing-config",
  );
  assert.match(missing.message, /WORKSPACE_DIR/);

  expectError(() => initializeWorkspace({ env: {} }), "missing-config");
  expectError(
    () => initializeWorkspace({ env: { WORKSPACE_DIR: "   " } }),
    "missing-config",
  );
  expectError(
    () => initializeWorkspace({ workspaceDir: "workspace-relatif" }),
    "invalid-config",
  );
  expectError(
    () => initializeWorkspace({ workspaceDir: "~/workspace" }),
    "invalid-config",
  );
});

test("menolak lokasi workspace yang ternyata file", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    fs.writeFileSync(workspaceRoot, "bukan folder");

    expectError(
      () => initializeWorkspace({ workspaceDir: workspaceRoot }),
      "not-a-directory",
    );

    assert.equal(fs.readFileSync(workspaceRoot, "utf8"), "bukan folder");
  });
});

test("menolak benturan folder dan file tanpa membuat item lain", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "episodes"), "file salah");

    expectError(
      () => initializeWorkspace({ workspaceDir: workspaceRoot }),
      "collision",
    );

    assert.equal(
      fs.readFileSync(path.join(workspaceRoot, "episodes"), "utf8"),
      "file salah",
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, "prompts")), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "guide")), false);
    assert.equal(fs.existsSync(agentsPath(workspaceRoot)), false);
  });
});

test("menolak agents.json yang berupa folder", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    fs.mkdirSync(path.join(workspaceRoot, AGENTS_FILE_NAME), {
      recursive: true,
    });

    expectError(
      () => initializeWorkspace({ workspaceDir: workspaceRoot }),
      "collision",
    );

    assert.equal(fs.statSync(agentsPath(workspaceRoot)).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "episodes")), false);
  });
});

test("menolak symlink pada folder workspace", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    const outside = path.join(parent, "outside");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(workspaceRoot, "episodes"));

    expectError(
      () => initializeWorkspace({ workspaceDir: workspaceRoot }),
      "symlink",
    );

    assert.deepEqual(fs.readdirSync(outside), []);
  });
});

test("menolak symlink pada agents.json dan tidak menulis keluar workspace", () => {
  withTempParent((parent) => {
    const workspaceRoot = path.join(parent, "workspace");
    const outside = path.join(parent, "outside");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.txt"), "rahasia");
    fs.symlinkSync(path.join(outside, "secret.txt"), agentsPath(workspaceRoot));

    expectError(
      () => initializeWorkspace({ workspaceDir: workspaceRoot }),
      "symlink",
    );

    assert.deepEqual(fs.readdirSync(outside), ["secret.txt"]);
    assert.equal(
      fs.readFileSync(path.join(outside, "secret.txt"), "utf8"),
      "rahasia",
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, "episodes")), false);
  });
});

test(
  "menolak workspace yang tidak bisa ditulis",
  { skip: typeof process.getuid === "function" && process.getuid() === 0 },
  () => {
    withTempParent((parent) => {
      const workspaceRoot = path.join(parent, "workspace");
      fs.mkdirSync(workspaceRoot);
      fs.chmodSync(workspaceRoot, 0o500);

      try {
        expectError(
          () => initializeWorkspace({ workspaceDir: workspaceRoot }),
          "permission-denied",
        );
      } finally {
        fs.chmodSync(workspaceRoot, 0o700);
      }
    });
  },
);
