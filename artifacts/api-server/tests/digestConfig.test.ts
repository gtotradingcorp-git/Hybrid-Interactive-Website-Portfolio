import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";

const { migrateLegacyDigestRecipients, _resetDigestConfigCache } = await import(
  "../src/lib/digestConfig.ts"
);

async function withTempConfig<T>(
  initial: string | null,
  fn: (file: string) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "digest-config-"));
  const file = path.join(dir, "weekly-digest-config.json");
  const prev = process.env["WEEKLY_DIGEST_CONFIG_FILE"];
  process.env["WEEKLY_DIGEST_CONFIG_FILE"] = file;
  if (initial !== null) {
    await fs.writeFile(file, initial, "utf8");
  }
  try {
    _resetDigestConfigCache();
    return await fn(file);
  } finally {
    if (prev === undefined) delete process.env["WEEKLY_DIGEST_CONFIG_FILE"];
    else process.env["WEEKLY_DIGEST_CONFIG_FILE"] = prev;
    await fs.rm(dir, { recursive: true, force: true });
    _resetDigestConfigCache();
  }
}

test("migrateLegacyDigestRecipients rewrites legacy address to cs_info inbox", async () => {
  await withTempConfig(
    JSON.stringify({
      recipients: ["john.libao@agentmail.to"],
      sendDay: 3,
      sendHour: 9,
      paused: false,
    }),
    async (file) => {
      await migrateLegacyDigestRecipients();
      const after = JSON.parse(await fs.readFile(file, "utf8")) as {
        recipients: string[];
        sendDay: number | null;
        sendHour: number | null;
        paused: boolean;
      };
      assert.deepEqual(after.recipients, ["cs_info@agentmail.to"]);
      assert.equal(after.sendDay, 3);
      assert.equal(after.sendHour, 9);
      assert.equal(after.paused, false);
    },
  );
});

test("migrateLegacyDigestRecipients de-duplicates when both addresses are present", async () => {
  await withTempConfig(
    JSON.stringify({
      recipients: [
        "cs_info@agentmail.to",
        "john.libao@agentmail.to",
        "extra@example.com",
      ],
      sendDay: null,
      sendHour: null,
      paused: true,
    }),
    async (file) => {
      await migrateLegacyDigestRecipients();
      const after = JSON.parse(await fs.readFile(file, "utf8")) as {
        recipients: string[];
        paused: boolean;
      };
      assert.deepEqual(after.recipients, [
        "cs_info@agentmail.to",
        "extra@example.com",
      ]);
      assert.equal(after.paused, true);
    },
  );
});

test("migrateLegacyDigestRecipients is a no-op when the config file is missing", async () => {
  await withTempConfig(null, async (file) => {
    await migrateLegacyDigestRecipients();
    await assert.rejects(
      () => fs.readFile(file, "utf8"),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    );
  });
});

test("migrateLegacyDigestRecipients leaves an already-migrated file untouched", async () => {
  const original = JSON.stringify(
    {
      recipients: ["cs_info@agentmail.to", "ops@example.com"],
      sendDay: 1,
      sendHour: 14,
      paused: false,
    },
    null,
    2,
  );
  await withTempConfig(original, async (file) => {
    await migrateLegacyDigestRecipients();
    const raw = await fs.readFile(file, "utf8");
    assert.equal(raw, original, "file contents must be byte-identical");
  });
});

test("migrateLegacyDigestRecipients leaves files without a recipients array untouched", async () => {
  const original = JSON.stringify(
    { sendDay: 2, sendHour: 8, paused: false },
    null,
    2,
  );
  await withTempConfig(original, async (file) => {
    await migrateLegacyDigestRecipients();
    const raw = await fs.readFile(file, "utf8");
    assert.equal(raw, original);
  });
});

test("migrateLegacyDigestRecipients leaves files with a malformed recipients field untouched", async () => {
  const original = JSON.stringify(
    { recipients: "john.libao@agentmail.to", sendDay: null, sendHour: null, paused: false },
    null,
    2,
  );
  await withTempConfig(original, async (file) => {
    await migrateLegacyDigestRecipients();
    const raw = await fs.readFile(file, "utf8");
    assert.equal(raw, original, "non-array recipients must not be rewritten");
  });
});

test("migrateLegacyDigestRecipients tolerates an unparseable config file", async () => {
  const original = "{not valid json";
  await withTempConfig(original, async (file) => {
    await migrateLegacyDigestRecipients();
    const raw = await fs.readFile(file, "utf8");
    assert.equal(raw, original);
  });
});
