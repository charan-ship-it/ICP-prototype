-- 1. Ensure files table has mime_type
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'files' and column_name = 'mime_type') then
    alter table files add column mime_type text;
  end if;
end $$;

-- 2. Storage RLS Policies for 'uploads' bucket
-- Allow public access to view/download (if needed) or restricted to auth
create policy "Allow public uploads to uploads bucket"
on storage.objects for insert
with check ( bucket_id = 'uploads' );

create policy "Allow public view of uploads bucket"
on storage.objects for select
using ( bucket_id = 'uploads' );
