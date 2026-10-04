import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Throwaway PostgreSQL schemas for tests whose effects the seed would not undo
// (docs/lab-03/specification.md D-22). Each test file creates its own schema,
// works only inside it, and drops it afterwards — the shared development
// database is never touched.

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS_DIR = path.join(SERVER_ROOT, "prisma", "migrations");
// The Prisma CLI's own entry point, run with the current Node binary. Spawning
// the `.bin/prisma.cmd` shim is refused on Windows by newer Node versions
// (EINVAL), and `shell: true` would route every argument — database URLs
// included — through cmd.exe parsing. Running node directly needs no shell and
// behaves the same on Windows and Linux.
const PRISMA_CLI = path.join(SERVER_ROOT, "node_modules", "prisma", "build", "index.js");

function baseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; run the tests inside the server container.");
  return url;
}

export function urlForSchema(schema: string): string {
  const url = new URL(baseUrl());
  url.searchParams.set("schema", schema);
  return url.toString();
}

// Migration folders in the order Prisma applies them (their timestamp prefix).
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => path.join(MIGRATIONS_DIR, name, "migration.sql"));
}

export function runPrisma(args: string[]): string {
  return execFileSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: SERVER_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export class ThrowawaySchema {
  readonly name = `lab3_test_${process.pid}_${randomBytes(4).toString("hex")}`;
  readonly url = urlForSchema(this.name);
  private admin = new PrismaClient({ datasources: { db: { url: baseUrl() } } });
  private clients: PrismaClient[] = [];

  async create(): Promise<void> {
    await this.admin.$executeRawUnsafe(`CREATE SCHEMA "${this.name}"`);
  }

  // Runs one migration file exactly as written, inside this schema.
  applyFile(file: string): void {
    runPrisma(["db", "execute", "--url", this.url, "--file", file]);
  }

  applyMigrations(files: string[] = migrationFiles()): void {
    for (const file of files) this.applyFile(file);
  }

  client(): PrismaClient {
    const c = new PrismaClient({ datasources: { db: { url: this.url } } });
    this.clients.push(c);
    return c;
  }

  async drop(): Promise<void> {
    for (const c of this.clients) await c.$disconnect();
    await this.admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${this.name}" CASCADE`);
    await this.admin.$disconnect();
  }
}
