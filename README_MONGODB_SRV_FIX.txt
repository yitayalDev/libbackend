Steps to fix the current MongoDB connection error:

Error: querySrv ETIMEOUT _mongodb._tcp.cluster0.h0n5vvj.mongodb.net
Meaning: SRV DNS lookups for mongodb+srv are timing out from this machine.

Fix options:
1) Use a non-SRV connection string
   - MongoDB Atlas -> Connect -> copy the mongodb:// (non-srv) string
   - Add it to backend/.env as:
       MONGODB_URI_NON_SRV=mongodb://...
   - Restart:
       npm run dev

2) Fix DNS/SRV resolution
   - Disable VPN/proxy temporarily
   - Change DNS server in Windows network adapter (try 1.1.1.1 / 8.8.8.8)
   - Switch network (mobile hotspot test)
   - Ensure corporate firewall allows DNS TXT/SRV lookups

Note: Atlas IP allowlisting alone is not sufficient if SRV DNS resolution is blocked.

