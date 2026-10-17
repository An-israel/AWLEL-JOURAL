-- Reverses 20261017000006_public_reads.sql.
drop function if exists public.search_articles(text, int, int, uuid, text, text, int, int);
drop function if exists public.categories_with_counts();
drop trigger if exists articles_updated_at on public.articles;
drop trigger if exists articles_version on public.articles;
drop index if exists public.articles_view_count_idx;
drop index if exists public.articles_download_count_idx;
alter table public.articles drop column if exists download_count;
create trigger articles_updated_at before update on public.articles
  for each row execute function public.set_updated_at('search_vector', 'view_count', 'download_pdf_count', 'download_docx_count');
create trigger articles_version before update on public.articles
  for each row execute function public.bump_version('search_vector', 'view_count', 'download_pdf_count', 'download_docx_count');
