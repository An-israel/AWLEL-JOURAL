-- Reverses 20261017000009_analytics.sql. Recorded events and rollups are kept.
drop function if exists public.metrics_top_articles(date, date, int);
drop function if exists public.metrics_timeseries(date, date, uuid);
drop function if exists public.rollup_metrics();
drop function if exists public.record_metric_event(public.metrics_event_type, text, uuid, uuid);
