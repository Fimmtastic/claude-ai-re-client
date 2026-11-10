// Generates clearly-marked demo data (frontmatter `sbos-testdata: true`) relative to today.
// Usage: node scripts/seed-demo.mjs [--vault ../Vault] [--today 2026-11-10] [--clean]
//  --clean  only removes files previously generated (sbos-testdata: true), never anything else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const vault = path.resolve(root, arg('--vault', '../Vault'));
const todayArg = arg('--today', null);
const clean = argv.includes('--clean');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const T = todayArg ? new Date(todayArg + 'T10:00:00') : new Date();
const D = (offset) => { const d = new Date(T); d.setDate(d.getDate() + offset); return iso(d); };
const year = T.getFullYear();

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// 1. remove previous demo files (only flagged ones)
let removed = 0;
for (const f of walk(vault)) {
  const head = fs.readFileSync(f, 'utf8').slice(0, 600);
  if (/^---[\s\S]*?sbos-testdata:\s*true[\s\S]*?---/.test(head)) { fs.rmSync(f); removed++; }
}
// remove now-empty folders created by the seed (never non-empty ones)
const prune = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) prune(path.join(dir, e.name));
  if (dir !== vault && fs.readdirSync(dir).length === 0 && !/^\d\d-/.test(path.basename(dir))) fs.rmdirSync(dir);
};
prune(vault);
console.log(`removed ${removed} previous demo files`);
if (clean) process.exit(0);

let idn = 0;
const id = (p) => `${p}-demo${String(++idn).padStart(4, '0')}`;
let tid = 0;
const tk = () => `^t-dm${String(++tid).padStart(4, '0')}`;
const files = [];
const write = (rel, fm, body, mtimeOffset = 0) => {
  const lines = ['---', ...Object.entries({ ...fm, 'sbos-testdata': true }).map(([k, v]) => Array.isArray(v) ? (v.length ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}` : `${k}: []`) : `${k}: ${typeof v === 'string' && /[:#\[\]"]/.test(v) ? JSON.stringify(v) : v}`), `sbos-mtime: "${D(mtimeOffset)}T${pad(9 + (Math.abs(mtimeOffset) % 9))}:${pad((idn * 7) % 60)}:00"`, '---'];
  files.push({ rel, content: `${lines.join('\n')}\n${body.trim()}\n`, mtime: new Date(`${D(mtimeOffset)}T${pad(9 + (Math.abs(mtimeOffset) % 9))}:${pad((idn * 7) % 60)}:00`) });
};

// ───────── Goals
write('05-Goals/Senior Systems Engineer werden.md', { id: id('gl'), type: 'goal', level: 'vision', area: 'Career', created: D(-200), description: 'In 5 Jahren komplexe Infrastrukturen eigenverantwortlich planen und betreiben.' }, `# Senior Systems Engineer werden\n\n## Why\nIch will Systeme verstehen, nicht nur bedienen.\n\n## Milestones\n- [x] Ausbildung begonnen ✅ ${D(-400)} ${tk()}\n- [ ] Abschlussprüfung bestehen #milestone 📅 ${year + 1}-06-30 ${tk()}\n`, -40);
write('05-Goals/CCNA bis Jahresende.md', { id: id('gl'), type: 'goal', level: 'year', area: 'Career', parent: '[[Senior Systems Engineer werden]]', due: `${year}-12-20`, created: D(-120) }, `# CCNA bis Jahresende\n\n## Why\nNetzwerk ist das Fundament von allem.\n\n## Next actions\n- [ ] Prüfungstermin bei Pearson VUE buchen ⏫ 📅 ${D(4)} ${tk()}\n- [x] Lernplan erstellen ✅ ${D(-60)} ${tk()}\n`, -3);
write('05-Goals/Q4 Netzwerkgrundlagen festigen.md', { id: id('gl'), type: 'goal', level: 'quarter', area: 'Career', parent: '[[CCNA bis Jahresende]]', due: `${year}-12-31`, created: D(-40) }, `# Q4: Netzwerkgrundlagen festigen\n\n## Next actions\n- [x] Subnetting ohne Hilfsmittel unter 60 Sekunden ✅ ${D(-12)} ${tk()}\n- [ ] STP Szenarien in Packet Tracer nachbauen 📅 ${D(6)} ${tk()}\n- [ ] OSPF Single-Area Lab ${tk()}\n`, -2);
write('05-Goals/12 Fachbücher lesen.md', { id: id('gl'), type: 'goal', level: 'year', area: 'Knowledge', target: 12, current: 9, unit: 'Bücher', due: `${year}-12-31`, created: D(-300) }, `# 12 Fachbücher lesen\n\n## Verlauf\n- ${D(-30)}: 8 → 9 Bücher\n`, -30);
write('05-Goals/Notgroschen aufbauen.md', { id: id('gl'), type: 'goal', level: 'year', area: 'Finance', target: 6000, current: 3900, unit: '€', due: `${year + 1}-03-31`, created: D(-250) }, `# Notgroschen aufbauen\n\nDrei Monatsausgaben als Rücklage.\n\n## Verlauf\n- ${D(-10)}: 3600 → 3900 €\n`, -10);
write('05-Goals/Dreimal pro Woche Sport.md', { id: id('gl'), type: 'goal', level: 'week', area: 'Health', created: D(-20) }, `# Dreimal pro Woche Sport\n\n- [x] Montag Laufen ✅ ${D(-8)} ${tk()}\n- [x] Mittwoch Gym ✅ ${D(-6)} ${tk()}\n- [ ] Freitag Schwimmen 🔁 every week 📅 ${D(3)} ${tk()}\n`, -6);

// ───────── Projects
write('04-Projects/Netzwerk-Umbau VLAN.md', { id: id('pr'), type: 'project', status: 'active', priority: 'high', area: 'Career', start: D(-24), deadline: D(18), goals: ['[[CCNA bis Jahresende]]', '[[Q4 Netzwerkgrundlagen festigen]]'], description: 'Flaches Büronetz in VLANs für Verwaltung, Gäste, VoIP und Drucker segmentieren.', created: D(-24) },
`# Netzwerk-Umbau VLAN\n\n## Milestones\n- [x] Ist-Aufnahme abgeschlossen #milestone 📅 ${D(-14)} ✅ ${D(-15)} ${tk()}\n- [ ] VLAN-Konzept freigegeben #milestone 📅 ${D(3)} ${tk()}\n- [ ] Rollout abgeschlossen #milestone 📅 ${D(18)} ${tk()}\n\n## Tasks\n- [x] Switch-Inventar in NetBox erfassen ✅ ${D(-13)} ${tk()}\n- [x] Port-Belegung Etage 2 dokumentieren ✅ ${D(-9)} ${tk()}\n- [x] Trunk zwischen Core und Access konfigurieren ✅ ${D(-5)} ${tk()}\n- [/] VLAN-Konzept mit Ausbilder abstimmen ⏫ 📅 ${D(0)} ${tk()}\n- [ ] DHCP-Scopes pro VLAN anlegen 🔼 📅 ${D(2)} ${tk()}\n- [ ] Gäste-WLAN auf VLAN 30 umstellen 📅 ${D(5)} ${tk()}\n- [ ] Firewall-Regeln zwischen VLANs definieren ⏫ ${tk()}\n- [ ] Rollback-Plan schreiben 🔽 ${tk()}\n\n## Notes\nSiehe [[VLAN]] und [[Spanning Tree Protocol]].\n\n## Resources\n- [[Cisco Packet Tracer]]\n`, 0);
write('04-Projects/Active Directory Migration.md', { id: id('pr'), type: 'project', status: 'active', priority: 'medium', area: 'Career', start: D(-40), deadline: D(45), description: 'Migration der Domäne von Server 2016 auf Server 2022 inkl. GPO-Bereinigung.', created: D(-40) },
`# Active Directory Migration\n\n## Milestones\n- [x] Testumgebung steht #milestone ✅ ${D(-20)} ${tk()}\n- [ ] FSMO-Rollen übertragen #milestone 📅 ${D(21)} ${tk()}\n\n## Tasks\n- [x] Neuen DC in Testumgebung hochstufen ✅ ${D(-18)} ${tk()}\n- [x] GPOs exportieren und dokumentieren ✅ ${D(-11)} ${tk()}\n- [x] Veraltete Benutzerkonten identifizieren ✅ ${D(-4)} ${tk()}\n- [ ] DNS-Replikation prüfen 📅 ${D(1)} ${tk()}\n- [ ] Migrationsplan mit Team abstimmen 📅 ${D(8)} ${tk()}\n- [ ] PowerShell-Skript für Kontobereinigung testen ${tk()}\n\nWissen: [[Active Directory]] · [[Gruppenrichtlinien]]\n`, -1);
write('04-Projects/Homelab Proxmox.md', { id: id('pr'), type: 'project', status: 'active', priority: 'low', area: 'Personal', start: D(-60), description: 'Privates Lab zum Üben: Proxmox-Cluster, pfSense, Monitoring.', created: D(-60) },
`# Homelab Proxmox\n\n## Tasks\n- [x] Proxmox auf altem Mini-PC installieren ✅ ${D(-50)} ${tk()}\n- [x] pfSense VM einrichten ✅ ${D(-21)} ${tk()}\n- [ ] Uptime Kuma als Monitoring aufsetzen ${tk()}\n- [ ] Backups nach 3-2-1 auf NAS ${tk()}\n`, -7);
write('04-Projects/IHK Abschlussprojekt.md', { id: id('pr'), type: 'project', status: 'planned', priority: 'high', area: 'Career', start: D(30), deadline: `${year + 1}-04-30`, goals: ['[[Senior Systems Engineer werden]]'], description: 'Themenfindung und Antrag für das betriebliche Abschlussprojekt.', created: D(-5) },
`# IHK Abschlussprojekt\n\n## Tasks\n- [ ] Drei Themenideen sammeln 📅 ${D(12)} ${tk()}\n- [ ] Mit Ausbilder Projektumfang klären ${tk()}\n`, -5);
write('04-Projects/Backup-Konzept 3-2-1.md', { id: id('pr'), type: 'project', status: 'done', priority: 'medium', area: 'Career', start: D(-90), deadline: D(-35), description: 'Backup-Strategie für Fileserver nach 3-2-1-Regel.', created: D(-90) },
`# Backup-Konzept 3-2-1\n\n## Tasks\n- [x] Ist-Analyse ✅ ${D(-80)} ${tk()}\n- [x] Veeam Jobs einrichten ✅ ${D(-50)} ${tk()}\n- [x] Restore-Test dokumentieren ✅ ${D(-36)} ${tk()}\n`, -35);

// ───────── Worklogs
const wl = [
  [-15, 'Ist-Aufnahme Netzwerk', 'Netzwerk-Umbau VLAN', '6h', ['NetBox', 'Cisco IOS'], 'work', 'Alle Switches erfasst, Uplinks dokumentiert.', ['CDP-Nachbarn helfen bei der Topologie', 'show interfaces status liefert schnelle Übersicht'], ['Zwei Switches ohne Zugangsdaten'], ['Über Konsolenkabel Passwort-Recovery'], ['Welche Firmware-Version ist Standard?'], ['Port-Belegung Etage 2']],
  [-14, 'Berufsschule: Subnetting', null, '6h', ['Subnetting', 'IPv4'], 'school', 'Subnetting-Übungen und VLSM.', ['VLSM spart Adressraum bei unterschiedlich großen Netzen'], [], [], ['Wie funktioniert Supernetting genau?'], []],
  [-13, 'Switch-Inventar in NetBox', 'Netzwerk-Umbau VLAN', '7h 30m', ['NetBox', 'Python'], 'work', 'Inventar importiert, Python-Skript für CSV-Import geschrieben.', ['NetBox REST-API mit pynetbox'], ['CSV-Encoding Umlaute'], ['UTF-8 mit BOM entfernen'], [], ['Port-Belegung erfassen']],
  [-11, 'GPOs dokumentieren', 'Active Directory Migration', '5h', ['Active Directory', 'Gruppenrichtlinien', 'PowerShell'], 'work', 'Alle GPOs per PowerShell exportiert und in Tabelle dokumentiert.', ['Get-GPOReport erzeugt HTML-Reports', 'Loopback-Verarbeitung verstanden'], ['Einige GPOs ohne Verknüpfung'], ['Als Kandidaten zur Löschung markiert'], ['Wer ist Owner der alten Drucker-GPOs?'], []],
  [-9, 'Port-Belegung Etage 2', 'Netzwerk-Umbau VLAN', '6h', ['Cisco IOS', 'VLAN'], 'work', 'Port-Belegung aufgenommen, VoIP-Telefone identifiziert.', ['Voice-VLAN über switchport voice vlan'], [], [], [], ['Trunk konfigurieren']],
  [-8, 'Ticket-Support Drucker', null, '3h', ['CUPS', 'Windows Druckserver'], 'work', 'Drei Druckertickets bearbeitet, Treiber aktualisiert.', ['Print-Nightmare Mitigation über GPO'], ['Treiberpaket fehlte'], ['Vom Hersteller-Portal geladen'], [], []],
  [-7, 'Berufsschule: Linux', null, '6h', ['Linux', 'Bash', 'systemd'], 'school', 'systemd Units geschrieben, journalctl geübt.', ['Timer-Units ersetzen Cronjobs', 'journalctl -u <unit> -f'], [], [], [], []],
  [-6, 'Homelab pfSense Regeln', 'Homelab Proxmox', '2h', ['pfSense', 'Firewall'], 'private', 'Firewall-Regeln im Homelab verfeinert.', ['Aliases machen Regeln lesbarer'], [], [], [], []],
  [-5, 'Trunk Core ↔ Access', 'Netzwerk-Umbau VLAN', '7h', ['Cisco IOS', 'VLAN', 'STP'], 'work', 'Trunks konfiguriert, Native VLAN angepasst, STP-Root festgelegt.', ['Native VLAN Mismatch erzeugt CDP-Warnungen', 'Root Bridge per Priority festlegen'], ['Native VLAN mismatch auf Uplink'], ['Native VLAN auf beiden Seiten auf 999 gesetzt'], ['Brauchen wir Rapid PVST+ überall?'], ['VLAN-Konzept finalisieren']],
  [-4, 'Benutzerkonten-Audit', 'Active Directory Migration', '4h 30m', ['Active Directory', 'PowerShell'], 'work', 'Inaktive Konten per Search-ADAccount gefunden.', ['Search-ADAccount -AccountInactive -TimeSpan 90'], [], [], ['Löschfristen laut Datenschutz?'], ['Skript testen']],
  [-2, 'DNS-Grundlagen Workshop', null, '3h', ['DNS', 'Windows Server'], 'work', 'Interner Workshop zu DNS-Zonen und Weiterleitungen.', ['Bedingte Weiterleitungen für Partnerdomänen'], [], [], [], []],
  [-1, 'VLAN-Konzept Entwurf', 'Netzwerk-Umbau VLAN', '6h 30m', ['VLAN', 'IP-Adressplanung'], 'work', 'Entwurf mit Adressplan für 6 VLANs erstellt.', ['/24 pro VLAN vereinfacht Betrieb'], ['Drucker mit fester IP im falschen Netz'], ['DHCP-Reservierungen geplant'], [], ['Mit Ausbilder abstimmen']],
  [0, 'Abstimmung VLAN-Konzept', 'Netzwerk-Umbau VLAN', '2h', ['VLAN'], 'work', 'Konzept vorgestellt, Feedback eingearbeitet.', ['Management-VLAN strikt trennen'], [], [], [], ['DHCP-Scopes anlegen']],
];
for (const [off, title, project, duration, tech, ctx, act, learned, problems, solutions, questions, next] of wl) {
  const d = D(off);
  write(`02-Worklogs/${d.slice(0, 4)}/${d} ${title.replace(/[\\/:*?"<>|↔]/g, '-')}.md`, { id: id('wl'), type: 'worklog', date: d, ...(project ? { project: `[[${project}]]` } : {}), duration, technologies: tech, context: ctx, created: d },
    `# ${title}\n\n## Tätigkeit\n${act}\n\n## Gelernt\n${learned.map((x) => `- ${x}`).join('\n') || '- '}\n\n## Probleme\n${problems.map((x) => `- ${x}`).join('\n') || '- '}\n\n## Lösungen\n${solutions.map((x) => `- ${x}`).join('\n') || '- '}\n\n## Offene Fragen\n${questions.map((x) => `- ${x}`).join('\n') || '- '}\n\n## Nächste Schritte\n${next.map((x) => `- ${x}`).join('\n') || '- '}\n`, off);
}

// ───────── Knowledge
const notes = [
  ['Netzwerk', 'VLAN', ['network', 'vlan', 'ccna'], true, `Ein **VLAN** trennt Broadcast-Domänen logisch auf einem physischen Switch.\n\n> [!tip] Merksatz\n> Access-Ports gehören zu genau einem VLAN, Trunks transportieren viele (802.1Q-Tag).\n\n| VLAN | Zweck | Netz |\n|---|---|---|\n| 10 | Verwaltung | 10.10.10.0/24 |\n| 20 | VoIP | 10.10.20.0/24 |\n| 30 | Gäste | 10.10.30.0/24 |\n\n\`\`\`\ninterface Gi0/1\n switchport mode trunk\n switchport trunk native vlan 999\n\`\`\`\n\nVerwandt: [[Spanning Tree Protocol]], [[Subnetting]]`, -1],
  ['Netzwerk', 'Subnetting', ['network', 'ipv4', 'ccna'], true, `Subnetting teilt ein Netz in kleinere Netze.\n\n## Schnellmethode\n1. Benötigte Hosts → nächste Zweierpotenz\n2. Blockgröße = 256 − Maske im interessanten Oktett\n\nSiehe [[OSI-Modell]].`, -12],
  ['Netzwerk', 'Spanning Tree Protocol', ['network', 'stp', 'ccna'], false, `STP verhindert Schleifen in redundanten Layer-2-Topologien.\n\n- Root Bridge: niedrigste Bridge-ID\n- Rapid PVST+ konvergiert in Sekunden\n\nSiehe [[VLAN]].`, -5],
  ['Netzwerk', 'OSI-Modell', ['network', 'grundlagen'], false, `Sieben Schichten von Bitübertragung bis Anwendung.\n\n> [!note] Eselsbrücke\n> **P**lease **D**o **N**ot **T**hrow **S**ausage **P**izza **A**way`, -64],
  ['Windows Server', 'Active Directory', ['windows', 'ad', 'identity'], true, `Verzeichnisdienst für Identitäten und Ressourcen.\n\n- FSMO-Rollen: Schema, Domain Naming, RID, PDC, Infrastructure\n- \`Get-ADUser -Filter *\`\n\nSiehe [[Gruppenrichtlinien]] und [[DNS]].`, -4],
  ['Windows Server', 'Gruppenrichtlinien', ['windows', 'gpo'], false, `GPOs werden in der Reihenfolge **LSDOU** angewendet: Local, Site, Domain, OU.\n\nLoopback-Verarbeitung erlaubt Benutzerrichtlinien abhängig vom Computer.\n\nSiehe [[Active Directory]].`, -11],
  ['Windows Server', 'DNS', ['windows', 'dns', 'network'], false, `Namensauflösung. Zonen, Weiterleitungen, bedingte Weiterleitungen.\n\nSiehe [[Active Directory]].`, -2],
  ['Linux', 'systemd Timer', ['linux', 'systemd'], false, `Timer-Units als Ersatz für cron.\n\n\`\`\`ini\n[Timer]\nOnCalendar=daily\nPersistent=true\n\`\`\``, -7],
  ['Linux', 'Bash Grundlagen', ['linux', 'bash'], false, `Variablen, Schleifen, Exit-Codes.\n\n\`set -euo pipefail\` macht Skripte robuster.`, -75],
  ['Security', '3-2-1 Backup-Regel', ['security', 'backup'], false, `3 Kopien, 2 Medien, 1 extern. Ergänzt durch **1 offline/immutable** und **0 Fehler** beim Restore-Test.\n\nProjekt: [[Backup-Konzept 3-2-1]]`, -36],
];
for (const [topic, title, tags, fav, body, off] of notes) {
  write(`03-Knowledge/${topic}/${title}.md`, { id: id('nt'), type: 'note', topic, tags, ...(fav ? { favorite: true } : {}), ...(tags.includes('ccna') ? { collection: 'CCNA Lernpfad' } : {}), created: D(off - 3) }, `# ${title}\n\n${body}`, off);
}
write('03-Knowledge/Inbox/Idee – Ansible für Switch-Configs.md', { id: id('nt'), type: 'note', topic: 'Inbox', tags: ['idea'], created: D(-1) }, `# Idee – Ansible für Switch-Configs\n\nSwitch-Konfigurationen mit Ansible versionieren statt per Hand.`, -1);

// Learning
write('03-Knowledge/Learning/CCNA 200-301.md', { id: id('ln'), type: 'learning', status: 'active', area: 'Career', progress: 28, total: 45, unit: 'Module', created: D(-110) },
`# CCNA 200-301\n\n## Ziel\nPrüfung bis Jahresende.\n\n## Sessions\n${[-27, -24, -20, -17, -13, -12, -10, -6, -5, -3, -1, 0].map((o, i) => `- ${D(o)} · ${30 + (i % 4) * 15}min · ${['Subnetting', 'VLANs', 'STP', 'EtherChannel', 'OSPF', 'ACLs'][i % 6]}`).join('\n')}\n`, 0);
write('03-Knowledge/Learning/LPIC-1.md', { id: id('ln'), type: 'learning', status: 'planned', area: 'Career', progress: 0, total: 10, unit: 'Kapitel', created: D(-20) }, `# LPIC-1\n\n## Ziel\nNach CCNA starten.\n\n## Sessions\n`, -20);
write('03-Knowledge/Learning/The Phoenix Project.md', { id: id('ln'), type: 'learning', status: 'active', area: 'Knowledge', progress: 210, total: 380, unit: 'Seiten', created: D(-25) }, `# The Phoenix Project\n\n## Sessions\n- ${D(-9)} · 40min · Kapitel 12–14\n- ${D(-4)} · 30min · Kapitel 15\n- ${D(-2)} · 45min · Kapitel 16–17\n`, -2);

// Resources
write('07-Resources/Cisco Packet Tracer.md', { id: id('rs'), type: 'resource', topic: 'Netzwerk', url: 'https://www.netacad.com/courses/packet-tracer', tags: ['network', 'tool'], created: D(-30) }, `# Cisco Packet Tracer\n\nSimulator für Netzwerk-Labs. Genutzt in [[Netzwerk-Umbau VLAN]].`, -30);

// Journal
const journal = [[-6, 4, 'Guter Tag. Der Trunk lief endlich stabil.', ['Native VLAN Problem gelöst']], [-5, 3, 'Viel Doku heute, wenig Hands-on.', []], [-3, 5, 'Workshop zu DNS war super. Ich verstehe Weiterleitungen jetzt wirklich.', ['DNS-Workshop', 'Laufen bei Sonnenuntergang']], [-2, 3, 'Müde, aber Konzept steht.', []], [-1, 4, 'VLAN-Entwurf fertig. Morgen Abstimmung.', ['Konzept fertig']], [0, 4, 'Feedback war positiv, kleine Anpassungen nötig.', ['Lob vom Ausbilder']]];
for (const [off, mood, text, hl] of journal) {
  const d = D(off);
  write(`06-Journal/${d.slice(0, 4)}/${d}.md`, { id: id('jn'), type: 'journal', date: d, mood, created: d }, `# ${d}\n\n## Gedanken\n${text}\n\n## Highlights\n${hl.map((x) => `- ${x}`).join('\n') || '- '}\n`, off);
}

// Daily notes with habits
const habits = ['Lesen', 'Sport', 'Lernen'];
for (let off = -13; off <= 0; off++) {
  const d = D(off);
  const h = habits.filter((_, i) => (off * 7 + i * 3 + 20) % (i + 2) !== 0);
  const fm = { id: id('dy'), type: 'daily', date: d, habits: off === 0 ? ['Lernen'] : h, created: d };
  if (off === 0) Object.assign(fm, { focus: 'VLAN-Konzept final abstimmen und DHCP-Scopes vorbereiten', focusProject: '[[Netzwerk-Umbau VLAN]]', motto: 'Erst verstehen, dann konfigurieren.' });
  write(`01-Daily/${d}.md`, fm, `# ${d}\n\n## Plan\n${off === 0 ? `- [ ] Mail an Ausbilder mit finalem Konzept ⏫ 📅 ${d} ${tk()}\n- [x] Packet-Tracer-Lab vorbereiten ✅ ${d} ${tk()}\n` : ''}\n## Notes\n`, off);
}

// Inbox
write('00-System/Inbox.md', { 'sbos-testdata': true }, `# Inbox\n\n## Tasks\n- [ ] Kabelmanagement im Serverraum ansprechen ${tk()}\n- [ ] Ansible Kurs recherchieren ${tk()}\n- [ ] Urlaubsantrag Dezember einreichen 🔼 📅 ${D(-1)} ${tk()}\n- [ ] Monatsbericht für Ausbilder 🔁 every month 📅 ${D(7)} ${tk()}\n`, 0);

// Review (last week)
const lw = new Date(T); lw.setDate(lw.getDate() - 7);
write(`06-Journal/Reviews/Weekly Review (Demo).md`, { id: id('rv'), type: 'review', period: 'weekly', date: D(-7), created: D(-7) }, `# Weekly Review\n\n## Summary\n- Tasks completed: 6\n\n## Reflection\n### Biggest wins this week\nTrunks laufen, GPO-Doku fertig.\n`, -7);

// write files
for (const f of files) {
  const p = path.join(vault, f.rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (fs.existsSync(p) && !/sbos-testdata:\s*true/.test(fs.readFileSync(p, 'utf8'))) { console.warn(`skip (user file exists): ${f.rel}`); continue; }
  fs.writeFileSync(p, f.content);
  fs.utimesSync(p, f.mtime, f.mtime);
}
console.log(`wrote ${files.length} demo files to ${vault} (today = ${iso(T)})`);
