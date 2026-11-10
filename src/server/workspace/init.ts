import fs from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "./paths.ts";

export const WORKSPACE_DIRECTORIES = [
  "episodes",
  "prompts",
  "guide",
] as const;

export const AGENTS_FILE_NAME = "agents.json";

export const DEFAULT_AGENTS_JSON = `${JSON.stringify(
  {
    agents: [
      {
        id: "command-code",
        name: "Command Code",
        command: "cmd",
        args: ["acp"],
      },
    ],
  },
  null,
  2,
)}\n`;

export type WorkspaceInitializationErrorCode =
  | "missing-config"
  | "invalid-config"
  | "not-a-directory"
  | "permission-denied"
  | "collision"
  | "symlink"
  | "unsafe-path"
  | "io-error";

export class WorkspaceInitializationError extends Error {
  readonly code: WorkspaceInitializationErrorCode;
  readonly fix: string;

  constructor(
    code: WorkspaceInitializationErrorCode,
    message: string,
    fix: string,
  ) {
    super(message);
    this.name = "WorkspaceInitializationError";
    this.code = code;
    this.fix = fix;
  }
}

export type WorkspaceInitializationResult = {
  workspaceRoot: string;
  createdDirectories: string[];
  createdAgentsFile: boolean;
};

export type WorkspaceEnvironment = Record<string, string | undefined>;

export type InitializeWorkspaceOptions = {
  workspaceDir?: string;
  env?: WorkspaceEnvironment;
};

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function isPermissionError(error: unknown): boolean {
  return isErrno(error, "EACCES") || isErrno(error, "EPERM");
}

function lstatOrNull(target: string): fs.Stats | null {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;

    if (isPermissionError(error)) {
      throw new WorkspaceInitializationError(
        "permission-denied",
        `Tidak punya izin untuk memeriksa ${target}.`,
        "Periksa izin folder dan file tersebut, atau pilih WORKSPACE_DIR lain.",
      );
    }

    throw new WorkspaceInitializationError(
      "io-error",
      `Gagal memeriksa ${target}.`,
      "Pastikan path dapat diakses, lalu jalankan ulang aplikasi.",
    );
  }
}

function mapFsError(
  error: unknown,
  target: string,
  action: string,
): WorkspaceInitializationError {
  if (isPermissionError(error)) {
    return new WorkspaceInitializationError(
      "permission-denied",
      `Tidak punya izin untuk ${action} ${target}.`,
      "Periksa izin folder (chmod/chown) atau pilih folder lain yang dapat ditulis.",
    );
  }

  if (isErrno(error, "EEXIST") || isErrno(error, "ENOTDIR")) {
    return new WorkspaceInitializationError(
      "collision",
      `Tidak bisa ${action} ${target} karena sudah ada item dengan tipe berbeda.`,
      "Pindahkan atau ganti nama item tersebut, lalu jalankan ulang aplikasi.",
    );
  }

  return new WorkspaceInitializationError(
    "io-error",
    `Gagal ${action} ${target}.`,
    "Periksa path dan izin folder, lalu jalankan ulang aplikasi.",
  );
}

export function resolveWorkspaceDir(
  workspaceDir?: string,
  env: WorkspaceEnvironment = process.env,
): string {
  const configured = (workspaceDir ?? env.WORKSPACE_DIR ?? "").trim();

  if (!configured) {
    throw new WorkspaceInitializationError(
      "missing-config",
      "WORKSPACE_DIR belum diisi.",
      "Buka .env.local, isi WORKSPACE_DIR dengan path absolut folder kerja, lalu restart server.",
    );
  }

  if (!path.isAbsolute(configured)) {
    throw new WorkspaceInitializationError(
      "invalid-config",
      `WORKSPACE_DIR harus berupa path absolut: "${configured}".`,
      "Gunakan path absolut seperti /Users/nama/Documents/workflow-workspace. Jangan memakai ~ atau path relatif.",
    );
  }

  return path.resolve(configured);
}

function ensureWorkspaceRoot(workspaceRoot: string): void {
  let stats = lstatOrNull(workspaceRoot);

  if (!stats) {
    try {
      fs.mkdirSync(workspaceRoot, { recursive: true, mode: 0o755 });
    } catch (error) {
      throw mapFsError(error, workspaceRoot, "membuat folder workspace");
    }

    stats = lstatOrNull(workspaceRoot);
  }

  if (!stats) {
    throw new WorkspaceInitializationError(
      "io-error",
      `Folder workspace tidak ditemukan setelah dibuat: ${workspaceRoot}.`,
      "Periksa path WORKSPACE_DIR dan izin folder induk.",
    );
  }

  if (stats.isSymbolicLink()) {
    try {
      stats = fs.statSync(workspaceRoot);
    } catch (error) {
      throw mapFsError(error, workspaceRoot, "membaca folder workspace");
    }
  }

  if (!stats.isDirectory()) {
    throw new WorkspaceInitializationError(
      "not-a-directory",
      `Lokasi workspace bukan folder: ${workspaceRoot}.`,
      "Hapus atau ganti file tersebut dengan folder, atau arahkan WORKSPACE_DIR ke folder lain.",
    );
  }

  try {
    fs.accessSync(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    throw mapFsError(error, workspaceRoot, "membaca dan menulis workspace");
  }
}

export function initializeWorkspace(
  options: InitializeWorkspaceOptions = {},
): WorkspaceInitializationResult {
  const workspaceRoot = resolveWorkspaceDir(
    options.workspaceDir,
    options.env ?? process.env,
  );

  ensureWorkspaceRoot(workspaceRoot);

  const directories = WORKSPACE_DIRECTORIES.map((name) => ({
    name,
    target: path.join(/*turbopackIgnore: true*/ workspaceRoot, name),
  }));

  for (const directory of directories) {
    const stats = lstatOrNull(directory.target);
    if (!stats) continue;

    if (stats.isSymbolicLink()) {
      throw new WorkspaceInitializationError(
        "symlink",
        `Folder workspace berisi symlink: ${directory.target}.`,
        "Ganti symlink tersebut dengan folder biasa, lalu jalankan ulang aplikasi.",
      );
    }

    if (!stats.isDirectory()) {
      throw new WorkspaceInitializationError(
        "collision",
        `Diharapkan folder ${directory.name}, tetapi yang ada adalah file: ${directory.target}.`,
        `Pindahkan atau ganti nama file tersebut agar ${directory.name} bisa dibuat sebagai folder.`,
      );
    }
  }

  const agentsPath = path.join(
    /*turbopackIgnore: true*/ workspaceRoot,
    AGENTS_FILE_NAME,
  );
  const existingAgents = lstatOrNull(agentsPath);

  if (existingAgents?.isSymbolicLink()) {
    throw new WorkspaceInitializationError(
      "symlink",
      `File konfigurasi agen tidak boleh berupa symlink: ${agentsPath}.`,
      "Ganti symlink tersebut dengan file biasa, lalu jalankan ulang aplikasi.",
    );
  }

  if (existingAgents && !existingAgents.isFile()) {
    throw new WorkspaceInitializationError(
      "collision",
      `Diharapkan file ${AGENTS_FILE_NAME}, tetapi yang ada bukan file: ${agentsPath}.`,
      `Pindahkan atau ganti nama item tersebut agar ${AGENTS_FILE_NAME} bisa dibuat sebagai file.`,
    );
  }

  const createdDirectories: string[] = [];

  for (const directory of directories) {
    const current = lstatOrNull(directory.target);

    if (!current) {
      try {
        fs.mkdirSync(directory.target, { mode: 0o755 });
      } catch (error) {
        throw mapFsError(error, directory.target, "membuat folder");
      }

      createdDirectories.push(directory.name);
    } else if (current.isSymbolicLink()) {
      throw new WorkspaceInitializationError(
        "symlink",
        `Folder workspace berisi symlink: ${directory.target}.`,
        "Ganti symlink tersebut dengan folder biasa, lalu jalankan ulang aplikasi.",
      );
    } else if (!current.isDirectory()) {
      throw new WorkspaceInitializationError(
        "collision",
        `Diharapkan folder ${directory.name}, tetapi yang ada adalah file: ${directory.target}.`,
        `Pindahkan atau ganti nama file tersebut agar ${directory.name} bisa dibuat sebagai folder.`,
      );
    }

    try {
      fs.accessSync(directory.target, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw mapFsError(error, directory.target, "membaca dan menulis folder");
    }
  }

  let createdAgentsFile = false;

  if (!existingAgents) {
    const resolution = resolveWorkspacePath({
      workspaceRoot,
      area: "root",
      fileName: AGENTS_FILE_NAME,
    });

    if (!resolution.ok) {
      throw new WorkspaceInitializationError(
        "unsafe-path",
        `Path ${AGENTS_FILE_NAME} ditolak penjaga workspace (${resolution.reason}).`,
        "Periksa isi workspace dan pastikan tidak ada symlink atau benturan tipe file.",
      );
    }

    try {
      fs.writeFileSync(resolution.path, DEFAULT_AGENTS_JSON, {
        encoding: "utf8",
        mode: 0o644,
        flag: "wx",
      });
      createdAgentsFile = true;
    } catch (error) {
      if (isErrno(error, "EEXIST")) {
        const current = lstatOrNull(resolution.path);

        if (current?.isSymbolicLink()) {
          throw new WorkspaceInitializationError(
            "symlink",
            `File konfigurasi agen tidak boleh berupa symlink: ${resolution.path}.`,
            "Ganti symlink tersebut dengan file biasa, lalu jalankan ulang aplikasi.",
          );
        }

        if (current && !current.isFile()) {
          throw new WorkspaceInitializationError(
            "collision",
            `Diharapkan file ${AGENTS_FILE_NAME}, tetapi yang ada bukan file: ${resolution.path}.`,
            `Pindahkan atau ganti nama item tersebut agar ${AGENTS_FILE_NAME} bisa dibuat sebagai file.`,
          );
        }
      } else {
        throw mapFsError(
          error,
          resolution.path,
          "membuat file konfigurasi agen",
        );
      }
    }
  }

  return {
    workspaceRoot,
    createdDirectories,
    createdAgentsFile,
  };
}
