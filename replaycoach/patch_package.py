import os
p = "/home/ubuntu/fitness-monitor/replaycoach/apps/web/package.json"
if os.path.exists(p):
    c = open(p).read()
    c = c.replace("\"start\": \"next start\"", "\"start\": \"next start -p 4002\"")
    open(p, "w").write(c)
    print("PORT PATCHED SUCCESSFULLY")
