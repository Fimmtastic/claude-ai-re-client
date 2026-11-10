---
id: nt-demo0025
type: note
topic: Netzwerk
tags:
  - "network"
  - "vlan"
  - "ccna"
favorite: true
collection: CCNA Lernpfad
created: 2026-11-06
sbos-testdata: true
sbos-mtime: "2026-11-09T10:55:00"
---
# VLAN

Ein **VLAN** trennt Broadcast-Domänen logisch auf einem physischen Switch.

> [!tip] Merksatz
> Access-Ports gehören zu genau einem VLAN, Trunks transportieren viele (802.1Q-Tag).

| VLAN | Zweck | Netz |
|---|---|---|
| 10 | Verwaltung | 10.10.10.0/24 |
| 20 | VoIP | 10.10.20.0/24 |
| 30 | Gäste | 10.10.30.0/24 |

```
interface Gi0/1
 switchport mode trunk
 switchport trunk native vlan 999
```

Verwandt: [[Spanning Tree Protocol]], [[Subnetting]]
