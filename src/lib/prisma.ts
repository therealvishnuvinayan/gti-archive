import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
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

export function isPrismaConnectionError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1001"
  ) {
    return true;
  }

  if (error instanceof Error) {
    return (
      error.message.includes("Error in PostgreSQL connection") ||
      error.message.includes("Can't reach database server") ||
      error.message.includes("Engine is not yet connected")
    );
  }

  return false;
}

export async function withPrismaRetry<T>(
  operation: () => Promise<T>,
  attempts = 2,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPrismaConnectionError(error) || attempts <= 1) {
      throw error;
    }

    await prisma.$disconnect().catch(() => undefined);
    await sleep(500);
    await prisma.$connect();

    return withPrismaRetry(operation, attempts - 1);
  }
}
