# Supabase Keepalive

This project keeps Supabase active with a lightweight read-only REST request:

```bash
node tools/supabase_keepalive.mjs
```

The request reads at most one `profiles.id` row through the public anon key. It does not write data.

Two schedulers are used:

- VM systemd user timer: primary keepalive, every 12 hours.
- GitHub Actions workflow: secondary keepalive, every 12 hours and manual dispatch.

The VM timer should run:

```bash
systemctl --user status mssi-supabase-keepalive.timer
journalctl --user -u mssi-supabase-keepalive.service -n 50 --no-pager
```

If the public Supabase URL or anon key changes, update `config.js` in the repo and redeploy the VM copy of `tools/supabase_keepalive.mjs`.
