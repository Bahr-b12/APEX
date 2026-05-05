-- Run from SQL*Plus after schema creation.
-- Option A: use SQL*Loader with the control files in this folder.
-- Option B: use external tables if preferred.

-- After loading raw data, refresh MV:
BEGIN
  DBMS_MVIEW.REFRESH('MV_MONTHLY_SPEND', 'C');
END;
/

