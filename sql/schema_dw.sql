-- APEX Data Warehouse Schema for Oracle XE 11.2

BEGIN
  EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW MV_MONTHLY_SPEND';
EXCEPTION WHEN OTHERS THEN NULL;
END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE FACT_TRANSACTIONS PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE FACT_BUDGET PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE DIM_DATE PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE DIM_CATEGORY PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/
BEGIN EXECUTE IMMEDIATE 'DROP TABLE DIM_ACCOUNT PURGE'; EXCEPTION WHEN OTHERS THEN NULL; END;
/

CREATE TABLE DIM_DATE (
  date_id NUMBER PRIMARY KEY,
  full_date DATE NOT NULL,
  day NUMBER NOT NULL,
  month NUMBER NOT NULL,
  year NUMBER NOT NULL
);

CREATE TABLE DIM_CATEGORY (
  category_id NUMBER PRIMARY KEY,
  category_name VARCHAR2(100) NOT NULL
);

CREATE TABLE DIM_ACCOUNT (
  account_id NUMBER PRIMARY KEY,
  account_type VARCHAR2(100) NOT NULL
);

CREATE TABLE FACT_TRANSACTIONS (
  transaction_id NUMBER PRIMARY KEY,
  date_id NUMBER NOT NULL,
  category_id NUMBER NOT NULL,
  account_id NUMBER NOT NULL,
  amount NUMBER(12,2) NOT NULL,
  CONSTRAINT fk_tx_date FOREIGN KEY (date_id) REFERENCES DIM_DATE(date_id),
  CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES DIM_CATEGORY(category_id),
  CONSTRAINT fk_tx_account FOREIGN KEY (account_id) REFERENCES DIM_ACCOUNT(account_id)
);

CREATE TABLE FACT_BUDGET (
  budget_id NUMBER PRIMARY KEY,
  category_id NUMBER NOT NULL,
  month DATE NOT NULL,
  budget_amount NUMBER(12,2) NOT NULL,
  CONSTRAINT fk_budget_category FOREIGN KEY (category_id) REFERENCES DIM_CATEGORY(category_id)
);

CREATE INDEX idx_tx_date ON FACT_TRANSACTIONS(date_id);
CREATE INDEX idx_tx_category ON FACT_TRANSACTIONS(category_id);
CREATE INDEX idx_tx_account ON FACT_TRANSACTIONS(account_id);

CREATE MATERIALIZED VIEW MV_MONTHLY_SPEND
BUILD IMMEDIATE
REFRESH COMPLETE ON DEMAND
AS
SELECT dd.year, dd.month, dc.category_name, SUM(ft.amount) total_amount
FROM FACT_TRANSACTIONS ft
JOIN DIM_DATE dd ON dd.date_id = ft.date_id
JOIN DIM_CATEGORY dc ON dc.category_id = ft.category_id
GROUP BY dd.year, dd.month, dc.category_name;

-- ROLLUP analytics
-- SELECT dd.year, dd.month, dc.category_name, SUM(ft.amount)
-- FROM FACT_TRANSACTIONS ft
-- JOIN DIM_DATE dd ON dd.date_id = ft.date_id
-- JOIN DIM_CATEGORY dc ON dc.category_id = ft.category_id
-- GROUP BY ROLLUP(dd.year, dd.month, dc.category_name);

-- CUBE analytics
-- SELECT dd.year, dd.month, dc.category_name, SUM(ft.amount)
-- FROM FACT_TRANSACTIONS ft
-- JOIN DIM_DATE dd ON dd.date_id = ft.date_id
-- JOIN DIM_CATEGORY dc ON dc.category_id = ft.category_id
-- GROUP BY CUBE(dd.year, dd.month, dc.category_name);

-- Window trends
-- SELECT dd.year, dd.month, SUM(ft.amount) total_amount,
--        LAG(SUM(ft.amount)) OVER (ORDER BY dd.year, dd.month) prev_month
-- FROM FACT_TRANSACTIONS ft
-- JOIN DIM_DATE dd ON dd.date_id = ft.date_id
-- GROUP BY dd.year, dd.month;

-- STDDEV anomaly baseline
-- SELECT dc.category_name, AVG(ft.amount) avg_amt, STDDEV(ft.amount) std_amt
-- FROM FACT_TRANSACTIONS ft
-- JOIN DIM_CATEGORY dc ON dc.category_id = ft.category_id
-- GROUP BY dc.category_name;
