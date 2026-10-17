-- =============================================================================
-- Analytics (section 9): recording views and downloads, the daily rollup with
-- 13-month raw retention (item 31), and the queries behind the dashboard.
-- Reversal: supabase/rollbacks/20261017000009_analytics.down.sql
-- =============================================================================

-- Records one view or download. Called only by server routes (service role),
-- which have already dropped bots and hashed the visitor. Returns true when
-- the event was new: the unique key on metrics_events allows one event of
-- each type per visitor per item per day (item 14). The article's running
-- counters move at once so public counts don't wait for the rollup.
create or replace function public.record_metric_event(
  p_event_type public.metrics_event_type,
  p_session_hash text,
  p_article_id uuid default null,
  p_issue_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new int;
begin
  if (p_article_id is null) = (p_issue_id is null) then
    raise exception 'Give exactly one of article or issue' using errcode = '22023';
  end if;

  -- Only published, live items are counted.
  if p_article_id is not null then
    perform 1 from public.articles a
      join public.issues i on i.id = a.issue_id
    where a.id = p_article_id and a.status = 'published' and a.deleted_at is null
      and i.status = 'published' and i.deleted_at is null;
  else
    perform 1 from public.issues i
    where i.id = p_issue_id and i.status = 'published' and i.deleted_at is null;
  end if;
  if not found then
    return false;
  end if;

  insert into public.metrics_events (article_id, issue_id, event_type, session_hash)
  values (p_article_id, p_issue_id, p_event_type, p_session_hash)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return false;
  end if;

  if p_article_id is not null then
    update public.articles set
      view_count = view_count + (p_event_type = 'view')::int,
      download_pdf_count = download_pdf_count + (p_event_type = 'download_pdf')::int,
      download_docx_count = download_docx_count + (p_event_type = 'download_docx')::int
    where id = p_article_id;
  end if;
  return true;
end;
$$;

-- Rolls raw events up into metrics_daily for every finished day not yet
-- rolled up (re-doing the last rolled day, which is safe), then deletes raw
-- events older than 13 months. Idempotent; run daily by cron (M8) and safe to
-- run by hand. Returns the number of daily rows written.
create or replace function public.rollup_metrics()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_from date;
  v_rows int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('awlel.rollup_metrics')) then
    return 0;
  end if;

  v_from := coalesce((select max(day) from public.metrics_daily),
                     (select min(event_day) from public.metrics_events));
  if v_from is not null and v_from < v_today then
    delete from public.metrics_daily where day >= v_from and day < v_today;
    insert into public.metrics_daily (day, article_id, issue_id, event_type, event_count)
    select event_day, article_id, issue_id, event_type, count(*)
    from public.metrics_events
    where event_day >= v_from and event_day < v_today
    group by event_day, article_id, issue_id, event_type;
    get diagnostics v_rows = row_count;
  end if;

  -- Retention: raw events only for days that are already rolled up.
  delete from public.metrics_events
  where event_day < (v_today - interval '13 months')::date
    and event_day <= coalesce((select max(day) from public.metrics_daily), '-infinity'::date);
  return v_rows;
end;
$$;

-- Daily views and downloads between two dates (inclusive), optionally for
-- one article. Rolled-up days come from metrics_daily, newer days from the
-- raw events, so today is always included. Runs as the caller: RLS limits
-- it to staff.
create or replace function public.metrics_timeseries(p_from date, p_to date, p_article_id uuid default null)
returns table (day date, views bigint, downloads bigint)
language sql
stable
set search_path = ''
as $$
  with watermark as (
    select coalesce(max(md.day), '-infinity'::date) as w from public.metrics_daily md
  ),
  events as (
    select md.day, md.event_type, md.event_count as n
    from public.metrics_daily md, watermark
    where md.day between p_from and p_to and md.day <= watermark.w
      and (p_article_id is null or md.article_id = p_article_id)
    union all
    select me.event_day, me.event_type, 1
    from public.metrics_events me, watermark
    where me.event_day between p_from and p_to and me.event_day > watermark.w
      and (p_article_id is null or me.article_id = p_article_id)
  )
  select g.day::date,
         coalesce(sum(e.n) filter (where e.event_type = 'view'), 0)::bigint,
         coalesce(sum(e.n) filter (where e.event_type <> 'view'), 0)::bigint
  from generate_series(p_from, p_to, interval '1 day') as g(day)
  left join events e on e.day = g.day::date
  group by g.day
  order by g.day
$$;

-- The most viewed articles between two dates, with their downloads.
create or replace function public.metrics_top_articles(p_from date, p_to date, p_limit int default 10)
returns table (article_id uuid, views bigint, downloads bigint)
language sql
stable
set search_path = ''
as $$
  with watermark as (
    select coalesce(max(md.day), '-infinity'::date) as w from public.metrics_daily md
  ),
  events as (
    select md.article_id, md.event_type, md.event_count as n
    from public.metrics_daily md, watermark
    where md.day between p_from and p_to and md.day <= watermark.w and md.article_id is not null
    union all
    select me.article_id, me.event_type, 1
    from public.metrics_events me, watermark
    where me.event_day between p_from and p_to and me.event_day > watermark.w and me.article_id is not null
  )
  select e.article_id,
         coalesce(sum(e.n) filter (where e.event_type = 'view'), 0)::bigint as views,
         coalesce(sum(e.n) filter (where e.event_type <> 'view'), 0)::bigint as downloads
  from events e
  group by e.article_id
  order by views desc, downloads desc
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.record_metric_event(public.metrics_event_type, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rollup_metrics() from public, anon, authenticated;
revoke execute on function public.metrics_timeseries(date, date, uuid) from public, anon;
revoke execute on function public.metrics_top_articles(date, date, int) from public, anon;
grant execute on function public.record_metric_event(public.metrics_event_type, text, uuid, uuid) to service_role;
grant execute on function public.rollup_metrics() to service_role;
grant execute on function public.metrics_timeseries(date, date, uuid) to authenticated;
grant execute on function public.metrics_top_articles(date, date, int) to authenticated;
