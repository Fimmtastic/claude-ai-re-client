---
id: nt-demo0032
type: note
topic: Linux
tags:
  - "linux"
  - "systemd"
created: 2026-10-31
sbos-testdata: true
sbos-mtime: "2026-11-03T16:44:00"
---
# systemd Timer

Timer-Units als Ersatz für cron.

```ini
[Timer]
OnCalendar=daily
Persistent=true
```
