-- Add summary column to files table
-- This stores the AI-generated summary shown to the user
do $$ 
begin
  if not exists (select 1 from information_schema.columns where table_name = 'files' and column_name = 'summary') then
    alter table files add column summary text;
  end if;
end $$;

