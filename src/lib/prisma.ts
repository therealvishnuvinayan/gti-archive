import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

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
      error.message.includes("Can't reach database server")
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
