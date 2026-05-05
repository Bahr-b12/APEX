-- Run in Supabase SQL Editor

create table if not exists dim_date (
  date_id bigint primary key,
  full_date date not null,
  day int not null,
  month int not null,
  year int not null
);

create table if not exists dim_category (
  category_id bigint primary key,
  category_name text not null
);

create table if not exists dim_account (
  account_id bigint primary key,
  account_type text not null
);

create table if not exists fact_transactions (
  transaction_id bigint primary key,
  date_id bigint not null references dim_date(date_id),
  category_id bigint not null references dim_category(category_id),
  account_id bigint not null references dim_account(account_id),
  amount numeric(12,2) not null
);

create table if not exists fact_budget (
  budget_id bigint primary key,
  category_id bigint not null references dim_category(category_id),
  month date not null,
  budget_amount numeric(12,2) not null
);

create index if not exists idx_ft_date on fact_transactions(date_id);
create index if not exists idx_ft_category on fact_transactions(category_id);
create index if not exists idx_ft_account on fact_transactions(account_id);

create or replace view v_transactions as
select ft.transaction_id, dd.full_date, dc.category_name, da.account_type, ft.amount
from fact_transactions ft
join dim_date dd on dd.date_id = ft.date_id
join dim_category dc on dc.category_id = ft.category_id
join dim_account da on da.account_id = ft.account_id;

create or replace view v_analytics_monthly as
select
  dd.year,
  dd.month,
  sum(ft.amount)::numeric(12,2) as total_amount,
  lag(sum(ft.amount)) over(order by dd.year, dd.month)::numeric(12,2) as prev_month_amount,
  lead(sum(ft.amount)) over(order by dd.year, dd.month)::numeric(12,2) as next_month_amount
from fact_transactions ft
join dim_date dd on dd.date_id = ft.date_id
group by dd.year, dd.month;

create or replace view v_analytics_category as
select
  dc.category_name,
  dd.year,
  dd.month,
  sum(ft.amount)::numeric(12,2) as total_amount
from fact_transactions ft
join dim_category dc on dc.category_id = ft.category_id
join dim_date dd on dd.date_id = ft.date_id
group by cube(dc.category_name, dd.year, dd.month);

create or replace view v_spending_anomalies as
with base as (
  select dc.category_name, dd.year, dd.month, ft.amount
  from fact_transactions ft
  join dim_category dc on dc.category_id = ft.category_id
  join dim_date dd on dd.date_id = ft.date_id
),
stats as (
  select category_name, avg(amount) as avg_amt, stddev(amount) as std_amt
  from base
  group by category_name
)
select b.category_name, b.year, b.month, b.amount, s.avg_amt, s.std_amt
from base b
join stats s on s.category_name = b.category_name
where b.amount > s.avg_amt + (2 * coalesce(s.std_amt, 0));

create or replace function fn_food_last_month()
returns table (total_spent numeric)
language sql
as $$
  select coalesce(sum(ft.amount),0)::numeric as total_spent
  from fact_transactions ft
  join dim_category dc on dc.category_id = ft.category_id
  join dim_date dd on dd.date_id = ft.date_id
  where lower(dc.category_name) = 'food'
    and dd.full_date >= date_trunc('month', current_date) - interval '1 month'
    and dd.full_date < date_trunc('month', current_date);
$$;

create or replace function fn_total_last_n_days(p_days int)
returns table (total_spent numeric)
language sql
as $$
  select coalesce(sum(ft.amount),0)::numeric as total_spent
  from fact_transactions ft
  join dim_date dd on dd.date_id = ft.date_id
  where dd.full_date >= current_date - (greatest(p_days,1) - 1)
    and dd.full_date < current_date + interval '1 day';
$$;

-- Read-only SQL executor for APEX AI (safe subset)
create or replace function exec_readonly_sql(p_sql text)
returns jsonb
language plpgsql
security definer
as $$
declare
  sql_text text := trim(p_sql);
  result jsonb;
begin
  if sql_text is null or sql_text = '' then
    raise exception 'SQL is empty';
  end if;

  if sql_text ~* ';' then
    raise exception 'Semicolons are not allowed';
  end if;

  if sql_text !~* '^select\s' then
    raise exception 'Only SELECT statements are allowed';
  end if;

  if sql_text ~* '\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b' then
    raise exception 'Only read-only SQL is allowed';
  end if;

  if sql_text !~* '\b(v_transactions|v_analytics_monthly|v_analytics_category|v_spending_anomalies)\b' then
    raise exception 'Query only approved warehouse views';
  end if;

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', sql_text) into result;
  return result;
end;
$$;
