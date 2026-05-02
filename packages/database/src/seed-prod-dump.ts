import { prisma } from "./client.js";
import { importProdDump } from "./prod-dump-import.js";

function parseArgs(argv: string[]) {
  let dumpPath: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--dump-path") {
      dumpPath = argv[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (!arg.startsWith("-") && dumpPath == null) {
      dumpPath = arg;
    }
  }

  return {
    dryRun,
    dumpPath: dumpPath ?? process.env.PROD_DB_DUMP_PATH?.trim() ?? null,
  };
}

async function main() {
  const { dumpPath, dryRun } = parseArgs(process.argv.slice(2));
  if (!dumpPath) {
    throw new Error(
      "Oppgi dump-path som første argument, via --dump-path, eller sett PROD_DB_DUMP_PATH.",
    );
  }

  await importProdDump(dumpPath, { dryRun });
}

main()
  .catch((error) => {
    console.error("Prod-dump import feilet:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
