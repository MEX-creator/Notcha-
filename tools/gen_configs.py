"""Generate steps_config.json: full IOS configuration per device (Etude de cas 9.4)."""
import json

COMMON = """service password-encryption
no ip domain-lookup
ip domain-name lab.local
enable secret Cisco12345
username admin privilege 15 secret Ssh12345
banner motd #Acces reserve - Etude de cas 9.4 - {host}#"""

TAIL = """line con 0
password Con12345
login
logging synchronous
exit
line vty 0 4
login local
transport input ssh
exit
ip ssh version 2
crypto key generate rsa modulus 1024
end
write memory"""

EIGRP_IFACE = """ip bandwidth-percent eigrp 10 20
ip authentication mode eigrp 10 md5
ip authentication key-chain eigrp 10 EIGRP-KEYS"""

KEYCHAIN = """key chain EIGRP-KEYS
key 1
key-string TRI789
exit"""

BODIES = {}

BODIES["R1"] = """
interface FastEthernet0/0
description LAN1 10 hotes zone OSPF 1
ip address 192.168.1.1 255.255.255.240
ip ospf authentication-key TRI123
no shutdown
exit
interface Serial0/0/0
description Vers R2 zone OSPF 1
ip address 192.168.1.33 255.255.255.252
ip ospf authentication-key TRI123
clock rate 64000
no shutdown
exit
router ospf 1
router-id 10.1.1.1
area 1 authentication
passive-interface FastEthernet0/0
network 192.168.1.0 0.0.0.15 area 1
network 192.168.1.32 0.0.0.3 area 1
exit
ip dhcp excluded-address 192.168.1.1 192.168.1.10
ip dhcp excluded-address 192.168.1.17 192.168.1.19
ip dhcp pool LAN1
network 192.168.1.0 255.255.255.240
default-router 192.168.1.1
dns-server 8.8.8.8
exit
ip dhcp pool LAN2
network 192.168.1.16 255.255.255.240
default-router 192.168.1.17
dns-server 8.8.8.8
exit
"""

BODIES["R2"] = """
interface FastEthernet0/0
description LAN2 9 hotes zone OSPF 1
ip address 192.168.1.17 255.255.255.240
ip helper-address 192.168.1.1
ip ospf authentication-key TRI123
no shutdown
exit
interface Serial0/0/0
description Vers R1 zone OSPF 1
ip address 192.168.1.34 255.255.255.252
ip ospf authentication-key TRI123
clock rate 64000
no shutdown
exit
interface Serial0/0/1
description Vers R3 zone OSPF 1
ip address 192.168.1.37 255.255.255.252
ip ospf authentication-key TRI123
clock rate 64000
no shutdown
exit
router ospf 1
router-id 10.2.2.2
area 1 authentication
passive-interface FastEthernet0/0
network 192.168.1.16 0.0.0.15 area 1
network 192.168.1.32 0.0.0.3 area 1
network 192.168.1.36 0.0.0.3 area 1
exit
"""

BODIES["R3"] = """
interface Serial0/0/0
description Vers R2 zone OSPF 1
ip address 192.168.1.38 255.255.255.252
ip ospf authentication-key TRI123
clock rate 64000
no shutdown
exit
interface FastEthernet0/0
description Vers R4 backbone OSPF 0
ip address 10.0.0.1 255.255.255.252
no shutdown
exit
interface Serial0/0/1
description Vers R6 backbone OSPF 0
ip address 10.0.0.5 255.255.255.252
clock rate 64000
no shutdown
exit
router ospf 1
router-id 30.3.3.3
area 1 authentication
area 1 range 192.168.1.0 255.255.255.0
passive-interface FastEthernet0/0
network 192.168.1.36 0.0.0.3 area 1
network 10.0.0.0 0.0.0.3 area 0
network 10.0.0.4 0.0.0.3 area 0
exit
"""

BODIES["R4"] = """
interface FastEthernet0/0
description Vers R3 backbone OSPF 0
ip address 10.0.0.2 255.255.255.252
no shutdown
exit
interface Serial0/0/0
description Vers R7 EIGRP AS 10
ip address 201.100.100.65 255.255.255.252
""" + EIGRP_IFACE + """
ip summary-address eigrp 10 201.100.100.0 255.255.255.0
clock rate 64000
no shutdown
exit
interface Serial0/0/1
description Vers R8 EIGRP AS 10
ip address 201.100.100.69 255.255.255.252
""" + EIGRP_IFACE + """
ip summary-address eigrp 10 201.100.100.0 255.255.255.0
clock rate 64000
no shutdown
exit
""" + KEYCHAIN + """
router eigrp 10
eigrp router-id 10.4.4.4
metric weights 0 1 2 1 0 0
passive-interface default
no passive-interface Serial0/0/0
no passive-interface Serial0/0/1
network 201.100.100.0 0.0.0.255
redistribute static
exit
router ospf 1
router-id 10.4.4.4
network 10.0.0.0 0.0.0.3 area 0
redistribute eigrp 10 subnets metric 100
default-information originate
exit
ip route 0.0.0.0 0.0.0.0 Null0
"""

BODIES["R5"] = """
interface FastEthernet0/0
description LAN4 26 hotes zone OSPF 2
ip address 192.168.2.1 255.255.255.224
ip ospf authentication-key TRI456
no shutdown
exit
interface Serial0/0/0
description Vers R6 zone OSPF 2
ip address 192.168.2.66 255.255.255.252
ip ospf authentication-key TRI456
clock rate 64000
no shutdown
exit
router ospf 1
router-id 10.5.5.5
area 2 authentication
passive-interface FastEthernet0/0
network 192.168.2.0 0.0.0.31 area 2
network 192.168.2.64 0.0.0.3 area 2
exit
ip dhcp excluded-address 192.168.2.1 192.168.2.9
ip dhcp excluded-address 192.168.2.33 192.168.2.39
ip dhcp pool LAN4
network 192.168.2.0 255.255.255.224
default-router 192.168.2.1
dns-server 8.8.8.8
exit
ip dhcp pool LAN3
network 192.168.2.32 255.255.255.224
default-router 192.168.2.33
dns-server 8.8.8.8
exit
"""

BODIES["R6"] = """
interface FastEthernet0/0
description LAN3 20 hotes zone OSPF 2
ip address 192.168.2.33 255.255.255.224
ip helper-address 192.168.2.1
ip ospf authentication-key TRI456
no shutdown
exit
interface Serial0/0/0
description Vers R5 zone OSPF 2
ip address 192.168.2.65 255.255.255.252
ip ospf authentication-key TRI456
clock rate 64000
no shutdown
exit
interface Serial0/0/1
description Vers R3 backbone OSPF 0
ip address 10.0.0.6 255.255.255.252
no shutdown
exit
router ospf 1
router-id 30.6.6.6
area 2 authentication
area 2 range 192.168.2.0 255.255.255.0
passive-interface FastEthernet0/0
network 192.168.2.32 0.0.0.31 area 2
network 192.168.2.64 0.0.0.3 area 2
network 10.0.0.4 0.0.0.3 area 0
exit
"""

BODIES["R7"] = """
interface FastEthernet0/0
description LAN5 40 hotes EIGRP AS 10
ip address 201.100.100.2 255.255.255.192
no shutdown
exit
interface FastEthernet0/1
description Liaison directe vers R8
ip address 201.100.100.73 255.255.255.252
""" + EIGRP_IFACE + """
no shutdown
exit
interface Serial0/0/0
description Vers R4 EIGRP AS 10
ip address 201.100.100.66 255.255.255.252
""" + EIGRP_IFACE + """
clock rate 64000
no shutdown
exit
""" + KEYCHAIN + """
router eigrp 10
eigrp router-id 10.7.7.7
metric weights 0 1 2 1 0 0
passive-interface default
no passive-interface FastEthernet0/1
no passive-interface Serial0/0/0
network 201.100.100.0 0.0.0.255
exit
"""

BODIES["R8"] = """
interface FastEthernet0/0
description LAN5 40 hotes EIGRP AS 10
ip address 201.100.100.3 255.255.255.192
no shutdown
exit
interface FastEthernet0/1
description Liaison directe vers R7
ip address 201.100.100.74 255.255.255.252
""" + EIGRP_IFACE + """
no shutdown
exit
interface Serial0/0/0
description Vers R4 EIGRP AS 10
ip address 201.100.100.70 255.255.255.252
""" + EIGRP_IFACE + """
clock rate 64000
no shutdown
exit
""" + KEYCHAIN + """
router eigrp 10
eigrp router-id 10.8.8.8
metric weights 0 1 2 1 0 0
passive-interface default
no passive-interface FastEthernet0/1
no passive-interface Serial0/0/0
network 201.100.100.0 0.0.0.255
exit
"""

SWITCH_COMMON = """service password-encryption
enable secret Cisco12345
username admin privilege 15 secret Ssh12345
ip domain-name lab.local
banner motd #Acces reserve - Etude de cas 9.4 - {host}#"""

SWITCHES = {"S4": "", "S5": ""}

steps = []
for host in ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]:
    text = "enable\nconfigure terminal\nhostname %s\n" % host
    text += COMMON.format(host=host) + "\n" + BODIES[host] + TAIL + "\n"
    cmds = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    steps.append({"label": "cfg-" + host, "tool": "pt_cli",
                  "args": {"device": host, "commands": cmds, "timeout": 240, "auto_confirm": True},
                  "timeout": 900})

for host in ["S4", "S5"]:
    text = "enable\nconfigure terminal\nhostname %s\n" % host
    text += SWITCH_COMMON.format(host=host) + "\nend\nwrite memory\n"
    cmds = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    steps.append({"label": "cfg-" + host, "tool": "pt_cli",
                  "args": {"device": host, "commands": cmds, "timeout": 240, "auto_confirm": True},
                  "timeout": 600})

with open("tools/steps_config.json", "w", encoding="utf-8") as fh:
    json.dump(steps, fh, indent=1, ensure_ascii=False)
print("steps:", len(steps))
for s in steps:
    print(s["label"], len(s["args"]["commands"]), "commands")
