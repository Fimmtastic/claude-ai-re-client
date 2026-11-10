---
id: wl-demo0020
type: worklog
date: 2026-11-05
project: "[[Netzwerk-Umbau VLAN]]"
duration: 7h
technologies:
  - "Cisco IOS"
  - "VLAN"
  - "STP"
context: work
created: 2026-11-05
sbos-testdata: true
sbos-mtime: "2026-11-05T14:20:00"
---
# Trunk Core ↔ Access

## Tätigkeit
Trunks konfiguriert, Native VLAN angepasst, STP-Root festgelegt.

## Gelernt
- Native VLAN Mismatch erzeugt CDP-Warnungen
- Root Bridge per Priority festlegen

## Probleme
- Native VLAN mismatch auf Uplink

## Lösungen
- Native VLAN auf beiden Seiten auf 999 gesetzt

## Offene Fragen
- Brauchen wir Rapid PVST+ überall?

## Nächste Schritte
- VLAN-Konzept finalisieren
