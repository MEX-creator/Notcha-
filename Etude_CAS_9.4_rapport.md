# Étude de cas 9.4 — Synthèse CCNA 3

**Topologie livrée :** `Etude_CAS_9-4_CCNA3.pkt` (Packet Tracer 9.0.1)
`C:\Users\Dell\Cisco Packet Tracer 9.0.1\saves\Etude_CAS_9-4_CCNA3.pkt`

Schéma imposé par le document (R1–R8, S0–S5, PC0–PC4) : OSPF multi-zone (zones 1 / 0 / 2),
domaine EIGRP AS 10, EtherChannel PAgP entre S4 et S5, HSRP sur le LAN 5, DHCP sur R1 et R5.

---

## 1. Matériel utilisé

| Rôle | Modèle | Quantité | Remarque |
|---|---|---|---|
| Routeurs | 2811 + **WIC-2T** | 8 (R1–R8) | FastEthernet0/0–0/1 intégrées + Serial0/0/0, Serial0/0/1 via la WIC-2T |
| Switchs | 2960-24TT | 6 (S0–S5) | S4/S5 reliés par 4 liens Fa0/1-4 (EtherChannel) |
| Stations | PC-PT | 5 (PC0–PC4) | PC0–PC3 en DHCP, PC4 en statique |

> Le 2811 n'accepte **pas** de HWIC-2T (module réservé aux 1941/2901/2911) ; c'est la **WIC-2T**
> qui fournit `Serial0/0/0` et `Serial0/0/1`.

## 2. Plan d'adressage VLSM

Quatre blocs : `192.168.1.0/24` (zone 1), `192.168.2.0/24` (zone 2),
`201.100.100.0/24` (EIGRP AS 10), `10.0.0.0/24` (backbone OSPF zone 0).

| Sous-réseau | Besoin | Masque | Adresse | Passerelle | Affectation |
|---|---|---|---|---|---|
| LAN 1 | 10 hôtes | /28 | 192.168.1.0 | .1 (R1 Fa0/0) | PC0, DHCP .11–.14 |
| LAN 2 | 9 hôtes | /28 | 192.168.1.16 | .17 (R2 Fa0/0) | PC1, DHCP .20–.29 |
| R1–R2 | 2 | /30 | 192.168.1.32 | — | .33 R1 / .34 R2 |
| R2–R3 | 2 | /30 | 192.168.1.36 | — | .37 R2 / .38 R3 |
| LAN 4 | 26 hôtes | /27 | 192.168.2.0 | .1 (R5 Fa0/0) | PC3, DHCP .10–.25 |
| LAN 3 | 20 hôtes | /27 | 192.168.2.32 | .33 (R6 Fa0/0) | PC2, DHCP .40–.55 |
| R6–R5 | 2 | /30 | 192.168.2.64 | — | .65 R6 / .66 R5 |
| LAN 5 | 40 hôtes | /26 | 201.100.100.0 | **.1 = VIP HSRP** | PC4 statique .10, R7 .2 (actif), R8 .3 (veille) |
| R4–R7 | 2 | /30 | 201.100.100.64 | — | .65 R4 / .66 R7 |
| R4–R8 | 2 | /30 | 201.100.100.68 | — | .69 R4 / .70 R8 |
| R7–R8 | 2 | /30 | 201.100.100.72 | — | .73 R7 / .74 R8 |
| R3–R4 | 2 | /30 | 10.0.0.0 | — | .1 R3 / .2 R4 |
| R3–R6 | 2 | /30 | 10.0.0.4 | — | .5 R3 / .6 R6 |

Ordre VLSM : plus gros besoins d'abord (/26 LAN5, /27 LAN3-4, /28 LAN1-2), liaisons /30 en dernier.
Marge libre : 192.168.1.64–255, 192.168.2.68–255, 201.100.100.76–255, 10.0.0.8–255.

## 3. Interfaces et protocoles

| Routeur | Fa0/0 | Fa0/1 | Serial0/0/0 | Serial0/0/1 | Rôle |
|---|---|---|---|---|---|
| R1 | 192.168.1.1/28 (A1) | — | .33 → R2 (A1) | — | DHCP LAN1+LAN2 |
| R2 | 192.168.1.17/28 (A1) | — | .34 → R1 (A1) | .37 → R3 (A1) | relais DHCP |
| R3 | 10.0.0.1/30 (A0) | — | .38 → R2 (A1) | 10.0.0.5 → R6 (A0) | ABR zones 1/0 |
| R4 | 10.0.0.2/30 (A0) | — | .65 → R7 (EIGRP) | .69 → R8 (EIGRP) | **ASBR** OSPF↔EIGRP |
| R5 | 192.168.2.1/27 (A2) | — | .66 → R6 (A2) | — | DHCP LAN3+LAN4 |
| R6 | 192.168.2.33/27 (A2) | — | .65 → R5 (A2) | 10.0.0.6 → R3 (A0) | ABR zones 2/0 |
| R7 | .2/26 LAN5 | .73 → R8 | .66 → R4 | — | HSRP actif (150) |
| R8 | .3/26 LAN5 | .74 → R7 | .70 → R4 | — | HSRP veille (100) |

Router ID : R1 10.1.1.1, R2 10.2.2.2, R3 **30.3.3.3**, R4 10.4.4.4, R5 10.5.5.5,
R6 **30.6.6.6**, R7 10.7.7.7, R8 10.8.8.8 → R3 et R6 ont bien l'ID le plus élevé.

## 4. Correspondance avec les 18 questions du TAF

| # | Demandé | Réalisé |
|---|---|---|
| 1 | Schéma réseau | 20 équipements câblés (23 liens), positions conformes au schéma |
| 2 | Plan VLSM | §2, blocs /26 /27 /28 /30 |
| 3 | Noms + mots de passe + SSH local | `enable secret Cisco12345`, user `admin/Ssh12345`, console `Con12345`, RSA 1024, `ip ssh version 2` sur R1–R8 |
| 4 | Interfaces selon VLSM | §3, `no shutdown` partout |
| 5 | EtherChannel 4 Fa PAgP S4↔S5 | `Po1` PAgP *desirable*, Fa0/1-4 en trunk |
| 6 | OSPF multi-zone + EIGRP, passives sur Fa | Zones 0/1/2 + AS 10, `passive-interface` sur les Fa des LAN |
| 7 | DHCP sur R1 et R5 | R1 : LAN1+LAN2, R5 : LAN4+LAN3 (`ip helper-address` sur R2 et R6) |
| 8 | Router ID, R3/R6 les plus élevés | 30.3.3.3 / 30.6.6.6 (§3) |
| 9 | Auth OSPF zone 1 et 2 | `area 1 authentication` + clé `TRI123` ; zone 2 `TRI456` |
| 10 | Auth EIGRP AS 10 | key chain `EIGRP-KEYS` / `TRI789`, MD5 sur les interfaces |
| 11 | Stations + tests | PC0–PC3 DHCP, PC4 statique ; matrice de ping 5/5 OK |
| 12 | Base topologique | `show ip ospf database`, `show ip eigrp topology` disponibles |
| 13 | Récapitulatifs OSPF et EIGRP | `ip summary-address eigrp 10 201.100.100.0/24` sur R4 ; `area 2 range 192.168.2.0/24` sur R6 |
| 14 | Quota de bande passante à 20 (EIGRP) | `bandwidth 20` sur les 6 interfaces EIGRP actives (voir §6) |
| 15 | Route par défaut propagée EIGRP + OSPF | `ip route 0.0.0.0 0.0.0.0 Null0` sur R4 + `default-information originate` (OSPF) + `redistribute static` (EIGRP) |
| 16 | Métriques EIGRP, coefficient de charge = 2 | `metric weights 0 1 2 1 0 0` sur R4/R7/R8 (K2 = 2) |
| 17 | R8 passerelle de secours du LAN 5 | HSRP groupe 1, VIP 201.100.100.1, R7 prio 150 (actif), R8 prio 100 (veille), préemption |
| 18 | Table de routage | `show ip route` sur R1, R4, R7 vérifiés |

## 5. Résultats de vérification (mesurés dans Packet Tracer)

- **OSPF** : R3 a 3 voisins `FULL` — R2 (10.2.2.2, zone 1), R4 (10.4.4.4, FULL/BDR, zone 0),
  R6 (30.6.6.6, zone 0). R1 reçoit `O IA 192.168.2.0/24`, `O IA 10.0.0.0/30`, `O IA 10.0.0.4/30`
  et une passerelle par défaut (`Gateway of last resort is 192.168.1.34`).
- **EIGRP** : R4 voit 201.100.100.66 (R7) et 201.100.100.70 (R8) ; R7 a `D*EX 0.0.0.0/0`
  et `D EX 10.0.0.0/30` via R4 (redistribution inverse OK).
- **Redistribution** : R2 reçoit `O E2 201.100.100.0/24 [110/20]`.
- **DHCP** : PC0 = 192.168.1.12, PC1 = 192.168.1.20, PC2 = 192.168.2.40, PC3 = 192.168.2.11
  (chacun dans le bon sous-réseau, passerelle = interface du routeur local).
- **Connectivité** : PC1→201.100.100.10 OK, PC1→192.168.2.40 OK, PC0→201.100.100.10 OK,
  PC4→192.168.1.20 OK, PC3→192.168.1.12 OK (0 % de perte).
- **HSRP** : R8 affiche `Active 201.100.100.2 / Standby local / Virtual IP 201.100.100.1`,
  R7 `Pri 150 P … Active 201.100.100.2` → R7 actif, R8 secours, préemption armée.
- **EtherChannel** : `Po1` formé en PAgP sur S4 et S5 (4 liens Fa0/1-4, trunk).
- **Santé** : `pt_health_check` → *Healthy topology*, aucun lien down, aucune IP dupliquée.

## 6. Écarts imposés par l'IOS de Packet Tracer

Ces lignes du cours sont **rejetées** par l'IOS émulé ; les équivalents ci-dessous ont été appliqués.

| Commande du cours | Rejet PT | Équivalent retenu |
|---|---|---|
| `crypto key generate rsa modulus 1024` | `% Invalid input` | `crypto key generate rsa` puis répondre `1024` au prompt |
| `ip bandwidth-percent eigrp 10 20` | `% Invalid input` | `bandwidth 20` sur les interfaces EIGRP (même effet sur la métrique) |
| `redistribute eigrp 10 subnets metric 100` | `% Invalid input` | `redistribute eigrp 10 subnets` (métrique externe par défaut 20) |
| `default-metric 100` (sous OSPF) | `% Invalid input` | idem : métrique OSPF externe par défaut |
| `area 1 range 192.168.1.0 255.255.255.0` | acceptée mais annoncée en **/28** (masque du 1er sous-réseau) → LAN2 injoignable | retirée ; le récapitulatif OSPF est porté par R6 (`area 2 range … /24`) et le récapitulatif EIGRP par R4 |

Autres remarques : après le durcissement, la console demande `login local` (le MCP a été remis en
`login` + mot de passe) ; HSRP affiche `Listen` sur R7 tout en le désignant comme actif — affichage
PT, le transfert est correct.

## 7. Outillage

`tools/pt_client.py` (client MCP stdio) et `tools/pt_batch.py` (exécution par lots) permettent de
rejouer ou de modifier la maquette depuis le serveur `packet-tracer-mcp`.
