// Offline development issuer. No application imports, .env loading, database client or network calls.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const repository = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
export const signingEnvironment = "flux-v2-dev/develop";
export const signingAudience = "flux-v2-dev:develop:neondb:5b001dbfcdb263fa:6c64549f4682ae1b";
class SigningError extends Error {}
function requireSigning(condition, code) { if (!condition) throw new SigningError(code); }

function privateDirectory(directory) {
  requireSigning(isAbsolute(directory), "ABSOLUTE_PRIVATE_DIRECTORY_REQUIRED");
  const canonical = realpathSync(directory), rel = relative(repository, canonical), stat = lstatSync(directory);
  requireSigning((rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) &&
    stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid?.() && (stat.mode & 0o077) === 0,
  "OWNER_ONLY_DIRECTORY_OUTSIDE_REPOSITORY_REQUIRED");
  return canonical;
}

function readPrivate(path) {
  requireSigning(isAbsolute(path), "ABSOLUTE_PRIVATE_FILE_REQUIRED");
  privateDirectory(dirname(path));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    requireSigning(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid?.() &&
      (stat.mode & 0o077) === 0 && stat.size <= 16384, "OWNER_ONLY_REGULAR_FILE_REQUIRED");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}

function writeNew(path, content) {
  requireSigning(isAbsolute(path), "ABSOLUTE_PRIVATE_FILE_REQUIRED");
  privateDirectory(dirname(path));
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, content, "utf8"); } finally { closeSync(fd); }
}

export function initializeSigner(directory) {
  requireSigning(isAbsolute(directory) && !existsSync(directory), "NEW_ABSOLUTE_SIGNER_DIRECTORY_REQUIRED");
  // Check the existing parent before creating anything; never create a key directory inside the checkout.
  const parent = realpathSync(dirname(directory)), rel = relative(repository, parent);
  requireSigning(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel), "SIGNER_MUST_BE_OUTSIDE_REPOSITORY");
  mkdirSync(directory, { mode: 0o700 });
  privateDirectory(directory);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeNew(join(directory, "issuer-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  writeNew(join(directory, "trust.json"), JSON.stringify({ publicKeyPem, audience: signingAudience }, null, 2));
  return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

function readTrust(directory) {
  const trust = JSON.parse(readPrivate(join(privateDirectory(directory), "trust.json")));
  requireSigning(trust && Object.keys(trust).sort().join(",") === "audience,publicKeyPem" &&
    trust.audience === signingAudience && typeof trust.publicKeyPem === "string" &&
    trust.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----"), "INVALID_DEVELOPMENT_TRUST");
  requireSigning(createPublicKey(trust.publicKeyPem).asymmetricKeyType === "ed25519", "ED25519_PUBLIC_KEY_REQUIRED");
  return trust;
}

export function installPublicTrust(directory, destination = join(homedir(), ".config", "flux-v2-development")) {
  const trust = readTrust(directory); // This operation never reads the private key.
  if (!existsSync(destination)) mkdirSync(destination, { mode: 0o700 });
  writeNew(join(privateDirectory(destination), "trust.json"), JSON.stringify(trust, null, 2));
}

export function validateSigningRequest(payload, expected, now = Date.now()) {
  requireSigning(typeof payload === "string" && payload.length <= 8192, "INVALID_REQUEST");
  const request = JSON.parse(payload);
  const keys = ["operation", "audience", "actorUserId", "targetUserId", "expectedVersion", "reason", "changeId", "issuedAt", "expiresAt"];
  requireSigning(request && Object.keys(request).length === keys.length && keys.every((key) => Object.hasOwn(request, key)), "INVALID_REQUEST_FIELDS");
  requireSigning(["BOOTSTRAP_DIRECTOR", "INITIAL_TECHNICAL_ADMIN"].includes(expected.operation) &&
    request.operation === expected.operation && request.audience === signingAudience, "REQUEST_SCOPE_MISMATCH");
  for (const field of ["actorUserId", "targetUserId"]) {
    requireSigning(typeof request[field] === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(request[field]) &&
      request[field] === expected[field], "REQUEST_IDENTITY_MISMATCH");
  }
  requireSigning(request.expectedVersion === null, "INITIAL_UNASSIGNED_TARGET_REQUIRED");
  requireSigning(typeof request.reason === "string" && request.reason.trim().length > 0 && request.reason.length <= 2000 &&
    !/[\x00-\x1f\x7f]/.test(request.reason), "INVALID_REQUEST_REASON");
  requireSigning(typeof request.changeId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.changeId), "INVALID_CHANGE_ID");
  requireSigning(Number.isSafeInteger(request.issuedAt) && Number.isSafeInteger(request.expiresAt) && request.issuedAt <= now &&
    request.expiresAt > now && request.expiresAt > request.issuedAt && request.expiresAt - request.issuedAt <= 600000,
  "REQUEST_EXPIRED_OR_INVALID_LIFETIME");
  return request;
}

export async function signRequest(directory, requestFile, approvalFile, expected, confirm) {
  const trust = readTrust(directory), payload = readPrivate(requestFile);
  const request = validateSigningRequest(payload, expected);
  const confirmation = `SIGN ${request.operation} ${request.changeId}`;
  // The key holder must authenticate the operator independently and compare both IDs with the read-only plan.
  requireSigning(await confirm(request, confirmation) === confirmation, "SIGNING_NOT_CONFIRMED");
  validateSigningRequest(payload, expected); // The request can expire while the operator is reviewing it.
  const key = createPrivateKey(readPrivate(join(directory, "issuer-private.pem")));
  requireSigning(key.asymmetricKeyType === "ed25519" &&
    createPublicKey(key).export({ type: "spki", format: "pem" }).toString() === trust.publicKeyPem, "SIGNING_KEY_MISMATCH");
  const signature = sign(null, Buffer.from(payload, "utf8"), key).toString("base64url");
  writeNew(approvalFile, JSON.stringify({ payload, signature }));
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "--help" && args.length === 0) {
    console.log(`Offline FLUX development signing (no database access).
init|install-trust|sign --environment ${signingEnvironment} --key-directory <absolute private directory>
sign also requires --request-file <path> --approval-file <new path>
  --operation <BOOTSTRAP_DIRECTOR|INITIAL_TECHNICAL_ADMIN> --operator-id <verified ID> --target-id <verified ID>
sign requires a local interactive terminal and explicit approval of the displayed request.
Only the public trust.json is installed for the database executor; private keys are never printed.`);
    return;
  }
  requireSigning(!process.env.CI && !process.env.VERCEL && (!process.env.NODE_ENV || process.env.NODE_ENV === "development"), "LOCAL_DEVELOPMENT_ONLY");
  requireSigning(["init", "install-trust", "sign"].includes(mode), "INVALID_SIGNING_MODE");
  const allowed = mode === "sign" ? ["--environment", "--key-directory", "--request-file", "--approval-file", "--operation", "--operator-id", "--target-id"]
    : ["--environment", "--key-directory"];
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    requireSigning(allowed.includes(key) && !Object.hasOwn(options, key) && value && !value.startsWith("--"), "INVALID_SIGNING_ARGUMENTS");
    options[key] = value;
  }
  requireSigning(Object.keys(options).length === allowed.length && options["--environment"] === signingEnvironment, "APPROVED_SIGNING_ENVIRONMENT_REQUIRED");
  if (mode === "init") console.log(JSON.stringify({ event: "SIGNER_INITIALIZED", publicKeySha256: initializeSigner(options["--key-directory"]), audience: signingAudience }));
  else if (mode === "install-trust") { installPublicTrust(options["--key-directory"]); console.log("PUBLIC_TRUST_INSTALLED; no database changes"); }
  else {
    requireSigning(process.stdin.isTTY && process.stdout.isTTY, "LOCAL_INTERACTIVE_SIGNER_REQUIRED");
    await signRequest(options["--key-directory"], options["--request-file"], options["--approval-file"], {
      operation: options["--operation"], actorUserId: options["--operator-id"], targetUserId: options["--target-id"],
    }, async (request, confirmation) => {
      console.log(JSON.stringify(request, null, 2));
      console.log("Authenticate the actual operator independently; verify the target and operator IDs against the read-only database plan.");
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try { return await terminal.question(`Type ${confirmation}: `); } finally { terminal.close(); }
    });
    console.log("SIGNED_APPROVAL_SAVED; no database changes");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Signing stopped: ${error instanceof SigningError ? error.message : "PROTECTED_FILE_OR_SIGNING_FAILURE"}. No automatic overwrite or key rotation.`);
    process.exitCode = 1;
  });
}
