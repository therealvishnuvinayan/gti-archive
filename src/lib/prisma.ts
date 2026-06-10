import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConnectPromise?: Promise<void>;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getDelegateName(modelName: string) {
  return `${modelName.slice(0, 1).toLowerCase()}${modelName.slice(1)}`;
}

function isPrismaClientCompatible(client: PrismaClient) {
  return Prisma.dmmf.datamodel.models.every((model) => {
    const delegateName = getDelegateName(model.name) as keyof PrismaClient;
    return typeof client[delegateName] !== "undefined";
  });
}

function getPrismaClient() {
  const cachedClient = globalForPrisma.prisma;

  if (cachedClient && isPrismaClientCompatible(cachedClient)) {
    return cachedClient;
  }

  const nextClient = createPrismaClient();
  globalForPrisma.prisma = nextClient;
  return nextClient;
}

export const prisma = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function getPrismaErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function isPrismaEngineNotConnectedError(error: unknown) {
  return getPrismaErrorMessage(error).includes("Engine is not yet connected");
}

export function isPrismaConnectionError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1001"
  ) {
    return true;
  }

  const message = getPrismaErrorMessage(error);

  if (message) {
    return (
      message.includes("Error in PostgreSQL connection") ||
      message.includes("Can't reach database server") ||
      message.includes("Engine is not yet connected")
    );
  }

  return false;
}

async function connectPrismaClient() {
  const existingConnectPromise = globalForPrisma.prismaConnectPromise;

  if (existingConnectPromise) {
    return existingConnectPromise;
  }

  const connectPromise = prisma.$connect();
  globalForPrisma.prismaConnectPromise = connectPromise;

  try {
    await connectPromise;
  } finally {
    if (globalForPrisma.prismaConnectPromise === connectPromise) {
      globalForPrisma.prismaConnectPromise = undefined;
    }
  }
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPrismaConnectionError(error) || attempts <= 1) {
      throw error;
    }

    if (!isPrismaEngineNotConnectedError(error)) {
      globalForPrisma.prismaConnectPromise = undefined;
      await prisma.$disconnect().catch(() => undefined);
    }

    const retryDelayMs = attempts > 3 ? 250 : attempts === 3 ? 500 : 1000;

    await sleep(retryDelayMs);
    await connectPrismaClient();

    return withPrismaRetry(operation, attempts - 1);
  }
}
