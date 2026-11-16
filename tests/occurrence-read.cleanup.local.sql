-- Local integration-test cleanup. The target email prefix is reserved by
-- tests/occurrence-read.local.mjs and is never used for real accounts.
do $cleanup$
begin
  delete from buscapet_private.occurrence_reports as report
  where report.reporter_id in (
      select account.id from auth.users as account
      where left(account.email, 8) = 'r4-read-'
    )
    or report.occurrence_id in (
      select occurrence.id
      from public.occurrences as occurrence
      join auth.users as account on account.id = occurrence.reporter_id
      where left(account.email, 8) = 'r4-read-'
    );

  delete from auth.users as account
  where left(account.email, 8) = 'r4-read-';
end;
$cleanup$;
