-- Retire the draft AuthSession table so the real one can be created.
--
-- A deployed database may carry an earlier, abandoned shape of this table:
--
--     tokenHash / family / lastUsedAt nullable / ipAddress
--
-- rather than the one this schema defines:
--
--     refreshTokenHash / familyId / lastUsedAt NOT NULL / replacedById / revokedReason
--
-- That shape reached production from a draft branch by way of `prisma db push`.
-- It matters here because the migration that follows creates the table with
-- `CREATE TABLE IF NOT EXISTS`: against a database that already holds the draft
-- table that step is skipped silently, the new columns never appear, and the
-- application then fails at runtime on the first sign-in rather than failing
-- loudly at deploy time.
--
-- The rows are dropped rather than translated, and that is a deliberate choice
-- rather than a shortcut. Every row is refresh-session state: an opaque token
-- hashed under the previous scheme, belonging to a token the current code would
-- refuse on sight. There is nothing of value to carry across, and no way to
-- derive a valid `refreshTokenHash` or `familyId` from what is stored. The cost
-- is that signed-in recruiters sign in once more. No recruitment record is
-- touched: User, Job, Candidate and their history are left exactly as they are.
--
-- Guarded so it is a no-op against a database that never saw the draft — a fresh
-- database, or one already carrying the correct table.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'AuthSession'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'AuthSession'
          AND column_name = 'refreshTokenHash'
    ) THEN
        RAISE NOTICE 'Dropping the draft AuthSession table; sessions are reissued on next sign-in.';
        DROP TABLE "AuthSession" CASCADE;
    END IF;
END $$;
