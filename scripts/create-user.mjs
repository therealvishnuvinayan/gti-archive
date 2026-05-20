import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomBytes, scryptSync } from "node:crypto";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const projectRoot = process.cwd();
loadEnvFile(path.join(projectRoot, ".env"));
loadEnvFile(path.join(projectRoot, ".env.local"));

const { PrismaClient, UserRole } = await import("@prisma/client");

const prisma = new PrismaClient();

function normalizeAuthEmail(email) {
  return email.trim().toLowerCase();
}

function hashAuthPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = getArg("--email");
const password = getArg("--password");
const name = getArg("--name");
const roleFlag = getArg("--role");

if (!email || !password) {
  console.error(
    "Usage: pnpm users:create --email <email> --password <password> [--name <name>] [--role SUPER_ADMIN|ADMIN|COLLABORATOR]",
  );
  process.exit(1);
}

if (password.trim().length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const role =
  roleFlag === "SUPER_ADMIN"
    ? UserRole.SUPER_ADMIN
    : roleFlag === "ADMIN"
      ? UserRole.ADMIN
      : UserRole.COLLABORATOR;
const normalizedEmail = normalizeAuthEmail(email);

try {
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    console.error(`User already exists: ${normalizedEmail}`);
    process.exit(1);
  }

  const createdUser = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: name?.trim() || null,
      passwordHash: hashAuthPassword(password),
      role,
    },
  });

  console.log(
    `Created ${createdUser.role} user ${createdUser.email}${createdUser.name ? ` (${createdUser.name})` : ""}.`,
  );
} finally {
  await prisma.$disconnect();
}
