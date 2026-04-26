import app from "./app";
import { logger } from "./lib/logger";
import { migrateLegacyDigestRecipients } from "./lib/digestConfig";
import { startWeeklyDigestScheduler } from "./lib/weeklyDigest";
import { startDemoPurgeScheduler } from "./lib/demoPurge";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void migrateLegacyDigestRecipients()
    .catch((migErr) => {
      logger.warn(
        { err: migErr },
        "Legacy digest recipient migration failed",
      );
    })
    .finally(() => {
      void startWeeklyDigestScheduler().catch((schedErr) => {
        logger.error(
          { err: schedErr },
          "Failed to start weekly digest scheduler",
        );
      });
      startDemoPurgeScheduler();
    });
});
