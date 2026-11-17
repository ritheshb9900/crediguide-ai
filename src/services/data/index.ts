import { ILoanDataProvider } from "./types";
import { PrismaLoanDataProvider } from "./prisma-adapter";
import { SyntheticLoanDataProvider } from "./synthetic-adapter";

let cachedProvider: ILoanDataProvider | null = null;

/**
 * Returns the active loan data provider.
 * Seamlessly selects PostgreSQL (via Prisma) when configured,
 * or the In-Memory Synthetic provider for zero-friction development and hackathon demos.
 */
export function getDataProvider(): ILoanDataProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  // Force synthetic provider if explicitly requested or if DATABASE_URL is not set
  const forceSynthetic = process.env.DATA_PROVIDER === "SYNTHETIC";
  const hasValidDbUrl = Boolean(
    process.env.DATABASE_URL &&
      !process.env.DATABASE_URL.includes("randompassword") &&
      process.env.DATABASE_URL.startsWith("postgres")
  );

  if (forceSynthetic || !hasValidDbUrl) {
    cachedProvider = new SyntheticLoanDataProvider();
    return cachedProvider;
  }

  try {
    cachedProvider = new PrismaLoanDataProvider();
    return cachedProvider;
  } catch (error) {
    console.warn("⚠️ Failed to initialize Prisma Data Provider, falling back to Synthetic:", error);
    cachedProvider = new SyntheticLoanDataProvider();
    return cachedProvider;
  }
}

export * from "./types";
export * from "./synthetic-data";
