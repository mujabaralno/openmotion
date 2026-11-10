import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolveWorkspacePath,
  type WorkspaceArea,
  type WorkspacePathRequest,
} from "../src/server/workspace/paths.ts";

type Fixture = {
  root: string;
  outside: string;
  cleanup: () => void;
};

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-paths-"));
  const outside = fs.mkdtempSync(
    path.join(os.tmpdir(), "workflow-paths-outside-"),
  );

  fs.mkdirSync(path.join(root, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(root, "guide"), { recursive: true });
  fs.mkdirSync(path.join(root, "episodes", "episode-a", "logs"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, "episodes", "episode-a", "out"), {
    recursive: true,
  });

  fs.writeFileSync(path.join(root, "agents.json"), "{}");
  fs.writeFileSync(path.join(root, "prompts", "script.md"), "script");
  fs.writeFileSync(
    path.join(root, "guide", "style-parallax.md"),
    "style",
  );
  fs.writeFileSync(
    path.join(root, "episodes", "episode-a", "episode.json"),
    "{}",
  );
  fs.writeFileSync(
    path.join(root, "episodes", "episode-a", "01-naskah.md"),
    "naskah",
  );
  fs.writeFileSync(
    path.join(root, "episodes", "episode-a", "logs", "script.jsonl"),
    "{}\n",
  );
  fs.writeFileSync(
    path.join(root, "episodes", "episode-a", "out", "episode-a.mp4"),
    "video",
  );
  fs.writeFileSync(path.join(outside, "secret.txt"), "rahasia");

  return {
    root,
    outside,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    },
  };
}

function withFixture(run: (fixture: Fixture) => void) {
  const fixture = createFixture();

  try {
    run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function request(
  root: string,
  overrides: Partial<WorkspacePathRequest> = {},
): WorkspacePathRequest {
  return {
    workspaceRoot: root,
    area: "root" as WorkspaceArea,
    fileName: "agents.json",
    ...overrides,
  };
}

function assertDenied(
  result: ReturnType<typeof resolveWorkspacePath>,
  reason: string,
) {
  assert.deepEqual(result, { ok: false, reason });
}

test("mengizinkan seluruh file yang ada di daftar putih", () => {
  withFixture(({ root }) => {
    const cases: Array<{
      request: WorkspacePathRequest;
      expected: string;
      content: string;
    }> = [
      {
        request: request(root),
        expected: "agents.json",
        content: "{}",
      },
      {
        request: request(root, {
          area: "prompts",
          fileName: "script.md",
        }),
        expected: "prompts/script.md",
        content: "script",
      },
      {
        request: request(root, {
          area: "guide",
          fileName: "style-parallax.md",
        }),
        expected: "guide/style-parallax.md",
        content: "style",
      },
      {
        request: request(root, {
          area: "episode",
          episodeSlug: "episode-a",
          fileName: "episode.json",
        }),
        expected: "episodes/episode-a/episode.json",
        content: "{}",
      },
      {
        request: request(root, {
          area: "episode",
          episodeSlug: "episode-a",
          fileName: "01-naskah.md",
        }),
        expected: "episodes/episode-a/01-naskah.md",
        content: "naskah",
      },
      {
        request: request(root, {
          area: "logs",
          episodeSlug: "episode-a",
          fileName: "script.jsonl",
        }),
        expected: "episodes/episode-a/logs/script.jsonl",
        content: "{}\n",
      },
      {
        request: request(root, {
          area: "out",
          episodeSlug: "episode-a",
          fileName: "episode-a.mp4",
        }),
        expected: "episodes/episode-a/out/episode-a.mp4",
        content: "video",
      },
    ];

    for (const item of cases) {
      const result = resolveWorkspacePath(item.request);

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.path, path.join(root, item.expected));
        assert.equal(result.relativePath, item.expected);
        assert.equal(fs.readFileSync(result.path, "utf8"), item.content);
      }
    }
  });
});

test("mengizinkan file baru dan folder induk yang belum ada", () => {
  withFixture(({ root }) => {
    fs.mkdirSync(path.join(root, "episodes", "episode-b"), {
      recursive: true,
    });

    const newEpisodeFile = resolveWorkspacePath(
      request(root, {
        area: "episode",
        episodeSlug: "episode-a",
        fileName: "02-naskah-tagged.md",
      }),
    );

    assert.equal(newEpisodeFile.ok, true);
    if (newEpisodeFile.ok) {
      assert.equal(fs.existsSync(newEpisodeFile.path), false);
    }

    const newLog = resolveWorkspacePath(
      request(root, {
        area: "logs",
        episodeSlug: "episode-b",
        fileName: "script.jsonl",
      }),
    );

    assert.equal(newLog.ok, true);
    if (newLog.ok) {
      assert.equal(fs.existsSync(newLog.path), false);
    }

    const newOutput = resolveWorkspacePath(
      request(root, {
        area: "out",
        episodeSlug: "episode-b",
        fileName: "episode-b.mp4",
      }),
    );

    assert.equal(newOutput.ok, true);
    if (newOutput.ok) {
      assert.equal(fs.existsSync(newOutput.path), false);
    }
  });
});

test("menolak workspace yang tidak sah", () => {
  withFixture(({ root, outside }) => {
    assertDenied(
      resolveWorkspacePath(
        request("workspace-relatif", { workspaceRoot: "workspace-relatif" }),
      ),
      "invalid-workspace",
    );
    assertDenied(
      resolveWorkspacePath(
        request(root, {
          workspaceRoot: path.join(root, "tidak-ada"),
        }),
      ),
      "invalid-workspace",
    );
    assertDenied(
      resolveWorkspacePath(
        request(root, {
          workspaceRoot: path.join(outside, "secret.txt"),
        }),
      ),
      "invalid-workspace",
    );
  });
});

test("menolak area yang tidak dikenal", () => {
  withFixture(({ root }) => {
    assertDenied(
      resolveWorkspacePath(
        request(root, {
          area: "rahasia" as WorkspaceArea,
        }),
      ),
      "invalid-area",
    );
  });
});

test("menolak nama file yang tidak aman", () => {
  withFixture(({ root }) => {
    const names = [
      "",
      ".",
      "..",
      "/etc/passwd",
      path.join(root, "agents.json"),
      "../agents.json",
      "folder/agents.json",
      "folder\\agents.json",
      "agents.json\u0000",
      "agents\n.json",
    ];

    for (const fileName of names) {
      assertDenied(
        resolveWorkspacePath(request(root, { fileName })),
        "invalid-filename",
      );
    }
  });
});

test("menolak nama file yang tidak ada di daftar putih", () => {
  withFixture(({ root }) => {
    const cases: Array<Partial<WorkspacePathRequest>> = [
      { area: "root", fileName: "secret.txt" },
      { area: "root", fileName: "01-naskah.md" },
      { area: "prompts", fileName: "script.txt" },
      { area: "guide", fileName: "style.md" },
      {
        area: "episode",
        episodeSlug: "episode-a",
        fileName: "rahasia.md",
      },
      {
        area: "logs",
        episodeSlug: "episode-a",
        fileName: "other.jsonl",
      },
      {
        area: "out",
        episodeSlug: "episode-a",
        fileName: "other.mp4",
      },
      {
        area: "out",
        episodeSlug: "episode-a",
        fileName: "episode-b.mp4",
      },
    ];

    for (const overrides of cases) {
      assertDenied(
        resolveWorkspacePath(request(root, overrides)),
        "filename-not-allowed",
      );
    }
  });
});

test("menolak slug episode yang dapat berpindah folder", () => {
  withFixture(({ root }) => {
    const slugs = [
      "",
      ".",
      "..",
      "../episode-b",
      "episode-a/../episode-b",
      "episode-a\\..\\episode-b",
      "episode_a",
      "Episode-A",
      "episode a",
      "a".repeat(65),
    ];

    for (const episodeSlug of slugs) {
      assertDenied(
        resolveWorkspacePath(
          request(root, {
            area: "episode",
            episodeSlug,
            fileName: "01-naskah.md",
          }),
        ),
        "invalid-slug",
      );
    }

    assertDenied(
      resolveWorkspacePath(
        request(root, {
          area: "episode",
          fileName: "01-naskah.md",
        }),
      ),
      "invalid-slug",
    );
  });
});

test("menolak file yang sudah ada tetapi bukan file biasa", () => {
  withFixture(({ root }) => {
    fs.rmSync(path.join(root, "agents.json"));
    fs.mkdirSync(path.join(root, "agents.json"));

    assertDenied(resolveWorkspacePath(request(root)), "not-a-file");
  });
});

test("menolak folder perantara yang ternyata file", () => {
  withFixture(({ root }) => {
    fs.rmSync(path.join(root, "prompts"), { recursive: true, force: true });
    fs.writeFileSync(path.join(root, "prompts"), "bukan folder");

    assertDenied(
      resolveWorkspacePath(
        request(root, { area: "prompts", fileName: "script.md" }),
      ),
      "not-a-directory",
    );
  });
});

test("menolak symlink pada file target", () => {
  withFixture(({ root, outside }) => {
    const target = path.join(
      root,
      "episodes",
      "episode-a",
      "01-naskah.md",
    );
    fs.rmSync(target);
    fs.symlinkSync(path.join(outside, "secret.txt"), target);

    assertDenied(
      resolveWorkspacePath(
        request(root, {
          area: "episode",
          episodeSlug: "episode-a",
          fileName: "01-naskah.md",
        }),
      ),
      "symlink",
    );
  });
});

test("menolak symlink pada folder perantara", () => {
  withFixture(({ root, outside }) => {
    const logs = path.join(root, "episodes", "episode-a", "logs");
    fs.rmSync(logs, { recursive: true, force: true });
    fs.symlinkSync(outside, logs);

    assertDenied(
      resolveWorkspacePath(
        request(root, {
          area: "logs",
          episodeSlug: "episode-a",
          fileName: "script.jsonl",
        }),
      ),
      "symlink",
    );
  });
});

test("menolak symlink pada folder episode", () => {
  withFixture(({ root, outside }) => {
    fs.symlinkSync(outside, path.join(root, "episodes", "episode-b"));

    assertDenied(
      resolveWorkspacePath(
        request(root, {
          area: "episode",
          episodeSlug: "episode-b",
          fileName: "01-naskah.md",
        }),
      ),
      "symlink",
    );
  });
});

test("menolak symlink pada folder workspace lain", () => {
  withFixture(({ root, outside }) => {
    fs.rmSync(path.join(root, "prompts"), {
      recursive: true,
      force: true,
    });
    fs.symlinkSync(outside, path.join(root, "prompts"));

    assertDenied(
      resolveWorkspacePath(
        request(root, { area: "prompts", fileName: "script.md" }),
      ),
      "symlink",
    );
  });
});

test("pembuatan file baru tidak bisa melewati folder induk symlink", () => {
  withFixture(({ root, outside }) => {
    const out = path.join(root, "episodes", "episode-a", "out");
    fs.rmSync(out, { recursive: true, force: true });
    fs.symlinkSync(outside, out);

    const result = resolveWorkspacePath(
      request(root, {
        area: "out",
        episodeSlug: "episode-a",
        fileName: "episode-a.mp4",
      }),
    );

    assertDenied(result, "symlink");
    assert.equal(fs.existsSync(path.join(outside, "episode-a.mp4")), false);
    assert.equal(
      fs.readFileSync(path.join(outside, "secret.txt"), "utf8"),
      "rahasia",
    );
  });
});

test("penolakan tidak mengubah atau membuat file di luar lokasi", () => {
  withFixture(({ root, outside }) => {
    const target = path.join(
      root,
      "episodes",
      "episode-a",
      "01-naskah.md",
    );
    fs.rmSync(target);
    fs.symlinkSync(path.join(outside, "secret.txt"), target);

    const result = resolveWorkspacePath(
      request(root, {
        area: "episode",
        episodeSlug: "episode-a",
        fileName: "01-naskah.md",
      }),
    );

    assertDenied(result, "symlink");
    assert.deepEqual(fs.readdirSync(outside), ["secret.txt"]);
    assert.equal(
      fs.readFileSync(path.join(outside, "secret.txt"), "utf8"),
      "rahasia",
    );
  });
});
