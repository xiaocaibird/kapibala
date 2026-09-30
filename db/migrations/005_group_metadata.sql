-- Local metadata only. Existing groups retain NULL values and their creation time.
ALTER TABLE groups ADD COLUMN name text, ADD COLUMN description text;
