-- Both public orders keep the id tie-break ascending, so reverse scans alone
-- cannot serve both timestamp directions. No existing business data is changed.
CREATE INDEX groups_directory_asc ON groups(created_at ASC,id ASC);
CREATE INDEX groups_directory_desc ON groups(created_at DESC,id ASC);
