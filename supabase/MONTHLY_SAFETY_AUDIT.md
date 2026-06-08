# Monthly Safety Audit

The VM runs a monthly audit that checks whether the keepalive safety nets are still working:

- Supabase REST API responds.
- GitHub Actions keepalive workflow file exists.
- Latest GitHub Actions keepalive run is recent.
- Google Apps Script webhook responds and can see the expected sheets.
- VM Supabase keepalive timer is active.

VM commands:

```bash
systemctl --user status mssi-monthly-safety-audit.timer
journalctl --user -u mssi-monthly-safety-audit.service -n 80 --no-pager
cat /home/ubuntu/mssi-keepalive/monthly-audit/latest.json
```

The timer runs monthly with a randomized delay. It writes the latest JSON report to:

```text
/home/ubuntu/mssi-keepalive/monthly-audit/latest.json
```
